https://www.10xgenomics.com/datasets/Flexv2_16k_Human_PBMCs_TotalseqC_4plex
这些文件是 10x Genomics 的 Cell Ranger 输出结果。它们不是原始测序数据 FASTQ，而是已经经过 Cell Ranger 处理后的结果文件。

## 文件含义总览

| 文件                                         | 代表什么                                          | 一般用途                                                        |
| ------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------- |
| `web_summary.html`                         | 网页版质控报告                                       | 用浏览器打开，查看细胞数、reads 数、mapping rate、UMI、抗体标签质量等               |
| `metrics_summary.csv`                      | 质控指标的表格版                                      | 和 `web_summary.html` 类似，但适合用 Excel、R 或 Python 读取            |
| `sample_cloupe.cloupe`                     | Loupe Browser 专用文件                            | 用 10x 的 Loupe Browser 可视化细胞聚类、表达量、抗体标签等                     |
| `sample_filtered_barcodes.csv`             | 过滤后认定为真实细胞的 barcode 列表                        | 只包含 Cell Ranger 判断为 cell-associated 的细胞条形码                  |
| `sample_filtered_feature_bc_matrix.h5`     | 过滤后的 feature-barcode 矩阵，HDF5 格式               | 最常用的下游分析输入之一；只包含真实细胞                                        |
| `sample_filtered_feature_bc_matrix.tar.gz` | 过滤后的 feature-barcode 矩阵，Matrix Market 文本格式压缩包 | 解压后通常包含 `matrix.mtx.gz`、`barcodes.tsv.gz`、`features.tsv.gz` |
| `sample_raw_feature_bc_matrix.h5`          | 原始 feature-barcode 矩阵，HDF5 格式                 | 包含所有 barcode，包括背景空液滴，不只是真实细胞                                |
| `sample_raw_feature_bc_matrix.tar.gz`      | 原始 feature-barcode 矩阵，Matrix Market 文本格式压缩包   | 适合某些工具重新做 cell calling 或背景校正                                |
| `sample_molecule_info.h5`                  | molecule-level 信息文件                           | 记录 UMI、barcode、feature 等分子级信息；用于高级重分析、聚合或特定下游工具             |
| `sample_raw_probe_bc_matrix.h5`            | 原始 probe-barcode 矩阵                           | 如果实验使用 probe-based chemistry，这里是按 probe 层面的 barcode 计数      |
| `sample_analysis.tar.gz`                   | Cell Ranger 自动分析结果                            | 包含 PCA、UMAP/t-SNE、聚类、差异表达等结果                                |
| `sample_cell_types.tar.gz`                 | 细胞类型注释结果                                      | 10x 自动推断的 cell type label 相关文件                              |
| `aggregate_barcodes.csv`                   | 聚合或多样本相关的 barcode 信息                          | 这个数据是 4plex，可能用于区分不同样本或聚合来源                                 |

## 最常用的文件

如果只是开始做常规分析，通常优先关注下面几个文件：

1. 看整体质量：`web_summary.html`
2. 做 Scanpy 或 Seurat 分析：`sample_filtered_feature_bc_matrix.h5`
3. 从更原始的矩阵重新处理：`sample_raw_feature_bc_matrix.h5`
4. 用 10x Loupe Browser 看图形界面：`sample_cloupe.cloupe`
5. 查看 Cell Ranger 自动聚类结果：`sample_analysis.tar.gz`

## 关于 Feature-barcode Matrix

这里的 `feature-barcode matrix` 不一定只包含基因表达。

因为这个样本是 TotalSeqC 数据，所以矩阵里通常可能同时包含：

- `Gene Expression`：基因表达
- `Antibody Capture`：抗体标签或 CITE-seq 蛋白标签
- 样本标签相关 feature

因此，`feature-barcode matrix` 比普通 scRNA-seq 的 `gene-barcode matrix` 更宽泛。它的行不一定全是基因，也可能包含抗体、标签或其他 feature。

## 简单理解

可以把这些文件分成几类：

| 类型 | 对应文件 |
|---|---|
| 质控报告 | `web_summary.html`, `metrics_summary.csv` |
| 可视化文件 | `sample_cloupe.cloupe` |
| 下游分析矩阵 | `sample_filtered_feature_bc_matrix.h5`, `sample_filtered_feature_bc_matrix.tar.gz` |
| 原始矩阵 | `sample_raw_feature_bc_matrix.h5`, `sample_raw_feature_bc_matrix.tar.gz`, `sample_raw_probe_bc_matrix.h5` |
| 高级重分析文件 | `sample_molecule_info.h5` |
| Cell Ranger 自动分析结果 | `sample_analysis.tar.gz`, `sample_cell_types.tar.gz` |
| 多样本或聚合信息 | `aggregate_barcodes.csv` |
