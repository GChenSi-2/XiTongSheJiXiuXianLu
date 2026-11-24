---
title: scRNA-seq 识别显著 PC：热图法与 Python 实现
source: HBC (Harvard Chan Bioinformatics Core) scRNA-seq 教程；Seurat DimHeatmap
tags: [scRNA-seq, Scanpy, Seurat, PCA, 降维, 聚类, Python, 开源贡献]
created: 2026-11-24
---

# scRNA-seq 识别显著 PC：热图法与 Python 实现

> [!abstract] 内容概览
> 1. 概念：用热图判断哪些 PC 有生物学意义
> 2. Python 实现：Seurat `DimHeatmap` 在 Scanpy 里的对应写法
> 3. 在 Jupyter 中使用
> 4. 向 Scanpy 社区贡献的路径

---

## 1. 概念

### 1.1 原文

> One way of exploring the PCs is using a heatmap to visualize the most variant genes for select PCs with the genes and cells ordered by PCA scores. The idea here is to look at the PCs and determine whether the genes driving them make sense for differentiating the different cell types.
> We are looking for a PC where the heatmap starts to look more "fuzzy", i.e. where the distinctions between the groups of genes is not so distinct.

### 1.2 为什么要挑 PC

PCA 之后，每个 PC 有两组数：

| 概念 | 存放位置 (Scanpy) | 含义 |
|---|---|---|
| **基因载荷 (loadings)** | `adata.varm["PCs"]` | 每个基因对该 PC 的贡献，有正有负 |
| **细胞得分 (scores)** | `adata.obsm["X_pca"]` | 每个细胞在该 PC 上的坐标 |

后续的 KNN 图、聚类和 UMAP 都只用**前 N 个 PC**：

- N 太小：丢掉区分稀有细胞类型的信号
- N 太大：把噪声带进聚类

### 1.3 热图怎么画

- **行**：该 PC 上载荷最极端的基因，正、负两端各取一半
- **列**：该 PC 得分最极端的细胞，两端各取一半（如共 500 个）
- 行和列都按 PCA 排序；scale 后的数据截断在 ±2.5

### 1.4 热图怎么看

| 情况 | 热图表现 | 含义 |
|---|---|---|
| ✅ 有意义的 PC | 清楚的**块状结构**：一组基因在左侧细胞高、右侧低，另一组相反 | 抓到了真实的生物学差异，通常对应两类细胞的区别 |
| ❌ 失去意义的 PC | **"fuzzy"**：分界模糊，颜色像随机噪点 | 主要在解释随机变异或技术噪声 |

> [!tip] 截断点
> 热图**开始变模糊的地方**，大致就是该截断的 PC 数。

### 1.5 检查驱动基因是否 "make sense"

看每个 PC 的驱动基因是不是已知的细胞类型 marker。

- **好例子（PBMC）**：PC1 的一端是 *CD3D*、*IL7R*（T 细胞），另一端是 *LYZ*、*S100A8*（单核细胞）
- **可疑信号**：主要由线粒体基因 (*MT-*)、核糖体基因 (*RPS*/*RPL*) 或细胞周期基因驱动的 PC，反映的可能是细胞状态或技术因素

### 1.6 注意事项

1. **方法比较主观**，需要配合其他方法：
   - **Elbow plot**：`sc.pl.pca_variance_ratio(adata, n_pcs=50, log=True)`
   - **JackStraw**：Seurat 老版本流程中常用的置换检验
2. **热图只取两端最极端的细胞**：它反映的是该 PC 能不能把两端的细胞分开，不代表所有细胞
3. **SCTransform 流程**：下游结果对 PC 数量不太敏感，HBC 建议**宁多勿少**（如 30–40 个）

---

## 2. Python 实现

### 2.1 为什么要自己写

- Python 有通用热图（`sc.pl.heatmap`、`seaborn.clustermap`），但 Scanpy **没有按 PC 自动选基因和细胞**的热图函数
- Scanpy 现有的 PCA 绘图函数只有 `pl.pca`、`pl.pca_loadings`、`pl.pca_variance_ratio`、`pl.pca_overview`
- 所以下面按照 Seurat `DimHeatmap` 的逻辑，用 Scanpy 的接口风格实现了 `pca_heatmap`

### 2.2 与 Seurat 参数对照

| Seurat `DimHeatmap` | `pca_heatmap` | 说明 |
|---|---|---|
| `dims = 1:9` | `components="1,2,...,9"` 或 `range(1, 10)` | 都是 1-based |
| `nfeatures = 30` | `n_genes=30` | |
| `cells = 500` | `n_cells=500` | `None` 表示全部细胞 |
| `balanced = TRUE` | `balanced=True` | |
| `disp.min / disp.max` | `vmin=-2.5 / vmax=2.5` | |
| `slot = "scale.data"` | `layer=None`（`adata.X`） / `use_raw=True` | |
| `reduction = "pca"` | `key_added=None` | 对应 `sc.tl.pca(key_added=...)` |
| `ncol` | `ncols=3` | |
| PurpleAndYellow 配色 | 默认 `cmap` | 紫-黑-黄 |

### 2.3 设计要点（Scanpy 风格）

- 接口照着 `sc.pl.pca_loadings` 写：`components` 从 1 开始编号，接受字符串或列表
- 第一个参数 `adata` 之后的参数只能用关键字传（`*`）
- 通用输出参数：`show` / `save`（存到 `sc.settings.figdir`）/ `return_fig`
- 只用 HVG 做 PCA 时，非 HVG 基因的载荷为 0，排序后落在中间，不会被选中
- 支持稀疏矩阵，docstring 按 numpydoc 格式写
- 已在 Scanpy 1.13 上用模拟数据测试：HVG 过滤、`key_added`、`use_raw`、`balanced=False`、`save` 都能正常工作

### 2.4 完整代码 `pca_heatmap.py`

```python
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
```

---

## 3. 在 Jupyter 中使用

### 3.1 导入
![[Bioinformatics/HBC/Note/attachments/pca_heatmap.py]]
**方法 1：放在 notebook 同一目录，然后 import（推荐）**

```python
%load_ext autoreload
%autoreload 2          # 改了 .py 之后不用重启 kernel

import scanpy as sc
from pca_heatmap import pca_heatmap
```

文件放在别的目录时：

```python
import sys
sys.path.append("/path/to/folder")   # 换成 pca_heatmap.py 所在的目录
from pca_heatmap import pca_heatmap
```

**方法 2：直接粘贴**：把整个文件内容贴进一个 cell 运行一次，之后就可以直接调用。

### 3.2 前置流程

```python
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)
sc.pp.highly_variable_genes(adata, n_top_genes=2000)
adata.raw = adata
adata = adata[:, adata.var.highly_variable].copy()
sc.pp.scale(adata, max_value=10)
sc.tl.pca(adata, n_comps=50)
```

### 3.3 常用写法

```python
pca_heatmap(adata)                                  # 默认 PC1–9
pca_heatmap(adata, range(10, 19))                   # PC10–18，往后看找"变模糊"的位置
pca_heatmap(adata, range(1, 16), ncols=5)           # 一次看 15 个
pca_heatmap(adata, "1,2,3", n_cells=None)           # 用全部细胞
pca_heatmap(adata, "1,2", use_raw=True, vmin=None, vmax=None)  # 画没 scale 的数据
pca_heatmap(adata, range(1, 10), save="_pbmc.pdf")  # 存为 figures/pca_heatmap_pbmc.pdf
pca_heatmap(adata, "1,2", key_added="pca_sct")      # PCA 用了自定义 key 时

help(pca_heatmap)   # 查看全部参数说明
```

### 3.4 配套函数

```python
sc.pl.pca_variance_ratio(adata, n_pcs=50, log=True)  # Elbow plot
sc.pl.pca_loadings(adata, components="1,2,3")        # 每个 PC 载荷最高的基因
```

> [!example] 模拟数据验证
> 用 3 种"细胞类型"（各有 40 个 marker 基因）加随机噪声做测试：只有 **PC1–2** 有清楚的块状结构，从 **PC3** 开始变模糊。3 类细胞只需要 2 个维度就能分开，结果符合预期。

---

## 4. 向社区贡献

> [!note] 贡献对象是 Scanpy，不是 Seurat
> Seurat 是 Satija Lab 维护的 **R 包**，Python 代码进不了它。Python 这边对应的生态是 **scverse**（Scanpy / AnnData）。

### 4.1 为什么 Scanpy 没有这个函数（推测，没有官方说法）

- 两边设计取向不同：Seurat 教程把 `DimHeatmap` 当选 PC 数的辅助工具；Scanpy 教程主要靠 elbow plot 来选
- SCTransform、"多取一些 PC" 等做法流行以后，靠肉眼逐个看热图的需求变少了

### 4.2 贡献流程

1. **去 Scanpy 的 GitHub issues 搜一下**：关键词 `DimHeatmap`、`PC heatmap`，看有没有人提过、维护者什么态度
2. **先开 issue，不要直接提 PR**：说明需求，附上对标 Seurat 的截图和最小实现，问维护者愿不愿意收、该放在哪里
   - Scanpy 正在开发基于 **HoloViews 的新绘图后端**（`ranking()` 在新后端中取代了 `pca_loadings()` 和 `pca_variance_ratio()`），新函数可能要求两套后端都支持，或者只写在新后端里
3. **维护者同意后再提 PR**，要包括：
   - 函数本身（比如叫 `sc.pl.pca_heatmap`）
   - 测试（Scanpy 用图像对比测试）
   - docstring 和文档条目
   - 一条 release note

### 4.3 替代路线

不想等社区评审的话，可以先自己发一个小包放到 PyPI，或者写成一篇 gist 或教程。被大家用起来以后再提给 Scanpy，说服力会更强。

---

## 5. 一句话总结

用热图逐个检查 PC：**块状结构清楚、驱动基因是合理 marker 的保留；热图开始糊掉的地方，就是截断位置。** Scanpy 没有现成函数，可以用 `pca_heatmap.py` 补上，以后还可以作为 PR 提给 scverse。
