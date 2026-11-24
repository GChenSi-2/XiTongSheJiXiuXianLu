"""
pca_heatmap: Scanpy-style port of Seurat's DimHeatmap.

For each principal component, plot a heatmap of the genes with the most extreme
loadings (rows) against the cells with the most extreme scores (columns), both
ordered by PCA. Used to judge how many PCs carry biological signal: keep PCs
whose heatmap shows clear block structure; stop where it starts to look "fuzzy".
"""
from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import scipy.sparse as sp
from anndata import AnnData
from matplotlib.axes import Axes
from matplotlib.colors import Colormap, LinearSegmentedColormap

__all__ = ["pca_heatmap"]

# Seurat's default PurpleAndYellow palette
_PURPLE_YELLOW = LinearSegmentedColormap.from_list(
    "purple_yellow", ["#FF00FF", "black", "#FFFF00"]
)


def _parse_components(components: str | Sequence[int] | None, n_pcs: int) -> np.ndarray:
    if components is None:
        components = list(range(1, min(9, n_pcs) + 1))
    elif isinstance(components, str):
        components = [int(x) for x in components.split(",")]
    comps = np.asarray(components, dtype=int) - 1
    if np.any(comps < 0):
        raise ValueError("Component indices must be greater than zero (1-based).")
    if np.any(comps >= n_pcs):
        raise ValueError(f"Requested component > number of computed PCs ({n_pcs}).")
    return comps


def _select_genes(loading: np.ndarray, n_genes: int, balanced: bool) -> np.ndarray:
    """Return gene indices ordered from most positive to most negative loading."""
    order = np.argsort(loading)  # ascending
    if balanced:
        half = n_genes // 2
        pos = order[-half:][::-1]
        neg = order[:half][::-1]
        return np.concatenate([pos, neg])
    top = np.argsort(np.abs(loading))[-n_genes:]
    return top[np.argsort(loading[top])[::-1]]


def _select_cells(score: np.ndarray, n_cells: int | None) -> np.ndarray:
    """Return cell indices ordered by score, keeping both extremes."""
    order = np.argsort(score)
    if n_cells is None or n_cells >= len(order):
        return order
    half = n_cells // 2
    return np.concatenate([order[:half], order[-half:]])


def _get_matrix(adata: AnnData, layer: str | None, use_raw: bool):
    if use_raw and layer is not None:
        raise ValueError("Cannot use `layer` and `use_raw=True` at the same time.")
    if use_raw:
        if adata.raw is None:
            raise ValueError("`use_raw=True` but `adata.raw` is None.")
        return adata.raw.X, adata.raw.var_names
    X = adata.layers[layer] if layer is not None else adata.X
    return X, adata.var_names


def pca_heatmap(
    adata: AnnData,
    components: str | Sequence[int] | None = None,
    *,
    n_genes: int = 30,
    n_cells: int | None = 500,
    balanced: bool = True,
    layer: str | None = None,
    use_raw: bool = False,
    key_added: str | None = None,
    vmin: float | None = -2.5,
    vmax: float | None = 2.5,
    cmap: str | Colormap | None = None,
    ncols: int = 3,
    panel_size: tuple[float, float] = (4.0, 4.0),
    gene_fontsize: float = 6,
    show_gene_labels: bool = True,
    colorbar: bool = True,
    show: bool | None = None,
    save: str | bool | None = None,
    return_fig: bool = False,
) -> list[Axes] | plt.Figure | None:
    """\
    Heatmap of top-loading genes vs. top-scoring cells for each PC.

    Python equivalent of Seurat's `DimHeatmap`. Run after
    :func:`scanpy.pp.scale` and :func:`scanpy.tl.pca`.

    Parameters
    ----------
    adata
        Annotated data matrix with PCA computed.
    components
        1-based PCs to plot, e.g. ``'1,2,3'`` or ``[1, 2, 3]``.
        Defaults to PCs 1–9.
    n_genes
        Number of genes per PC. With ``balanced=True``, half come from the
        positive end of the loadings and half from the negative end.
    n_cells
        Number of cells per PC, half from each end of the score distribution.
        ``None`` plots all cells.
    balanced
        Take equal numbers of positive- and negative-loading genes. If
        ``False``, take the ``n_genes`` with the largest absolute loadings.
    layer
        Layer to plot. Defaults to ``adata.X``, which should hold scaled data.
    use_raw
        Plot values from ``adata.raw`` (e.g. unscaled log-normalized data).
        Consider ``vmin=None, vmax=None`` in that case.
    key_added
        The ``key_added`` passed to :func:`scanpy.tl.pca`, if any. Scores are
        read from ``adata.obsm[key_added]`` and loadings from
        ``adata.varm[key_added]``. Defaults to ``'X_pca'`` / ``'PCs'``.
    vmin, vmax
        Color scale limits; values outside are clipped (Seurat's
        ``disp.min`` / ``disp.max``).
    cmap
        Colormap. Defaults to Seurat's purple–black–yellow.
    ncols
        Number of panels per row.
    panel_size
        Width and height of each panel in inches.
    gene_fontsize
        Font size of gene labels.
    show_gene_labels
        Whether to label rows with gene names.
    colorbar
        Whether to draw a shared colorbar.
    show
        Show the plot. If ``None``, show unless ``return_fig`` is ``True``.
    save
        If ``True`` or a ``str``, save to ``sc.settings.figdir``. A string is
        appended to the default filename ``pca_heatmap``; its extension sets
        the format (default ``sc.settings.file_format_figs``).
    return_fig
        Return the :class:`~matplotlib.figure.Figure`.

    Returns
    -------
    The figure if ``return_fig=True``; otherwise a list of axes if
    ``show=False``; otherwise ``None``.

    Examples
    --------
    >>> import scanpy as sc
    >>> adata = sc.datasets.pbmc3k_processed()
    >>> pca_heatmap(adata, components="1,2,3,4,5,6", n_cells=500)
    """
    obsm_key = key_added if key_added is not None else "X_pca"
    varm_key = key_added if key_added is not None else "PCs"
    if obsm_key not in adata.obsm or varm_key not in adata.varm:
        raise KeyError(
            f"PCA not found (adata.obsm[{obsm_key!r}] / adata.varm[{varm_key!r}]). "
            "Run sc.tl.pca first."
        )
    scores = np.asarray(adata.obsm[obsm_key])
    loadings = np.asarray(adata.varm[varm_key])

    comps = _parse_components(components, loadings.shape[1])
    n_genes = min(n_genes, adata.n_vars)
    X, plot_var_names = _get_matrix(adata, layer, use_raw)
    cmap = _PURPLE_YELLOW if cmap is None else cmap

    ncols = max(1, min(ncols, len(comps)))
    nrows = int(np.ceil(len(comps) / ncols))
    fig, axes = plt.subplots(
        nrows, ncols,
        figsize=(panel_size[0] * ncols, panel_size[1] * nrows),
        squeeze=False,
    )

    im = None
    used_axes: list[Axes] = []
    for ax, pc in zip(axes.flat, comps):
        gene_idx = _select_genes(loadings[:, pc], n_genes, balanced)
        cell_idx = _select_cells(scores[:, pc], n_cells)
        genes = adata.var_names[gene_idx]

        if use_raw:
            col_idx = plot_var_names.get_indexer(genes)
            if np.any(col_idx < 0):
                raise KeyError("Some selected genes are missing from adata.raw.")
        else:
            col_idx = gene_idx

        sub = X[cell_idx][:, col_idx]
        sub = sub.toarray() if sp.issparse(sub) else np.asarray(sub)
        mat = sub.T  # genes x cells
        if vmin is not None or vmax is not None:
            mat = np.clip(mat, vmin, vmax)

        im = ax.imshow(mat, aspect="auto", cmap=cmap, vmin=vmin, vmax=vmax,
                       interpolation="nearest")
        ax.set_title(f"PC{pc + 1}")
        ax.set_xticks([])
        if show_gene_labels:
            ax.set_yticks(range(len(genes)))
            ax.set_yticklabels(genes, fontsize=gene_fontsize)
        else:
            ax.set_yticks([])
        used_axes.append(ax)

    for ax in axes.flat[len(comps):]:
        ax.axis("off")

    fig.tight_layout()
    if colorbar and im is not None:
        fig.colorbar(im, ax=axes.ravel().tolist(), shrink=0.6, pad=0.02,
                     label="scaled expression" if not use_raw else "expression")

    if save:
        import scanpy as sc
        suffix = save if isinstance(save, str) else ""
        name = f"pca_heatmap{suffix}"
        if Path(name).suffix.lstrip(".") not in {"png", "pdf", "svg", "jpg", "jpeg"}:
            name += f".{sc.settings.file_format_figs}"
        figdir = Path(sc.settings.figdir)
        figdir.mkdir(parents=True, exist_ok=True)
        dpi = getattr(sc.settings, "dpi_save", None) or plt.rcParams["savefig.dpi"]
        fig.savefig(figdir / name, dpi=dpi, bbox_inches="tight")

    if return_fig:
        return fig
    if show is False:
        return used_axes
    plt.show()
    return None
