`alevin-fry` 是一个用于单细胞 / 单核 RNA-seq 数据定量的生信工具。

简单说，它的作用是：

> 把 FASTQ 里的测序 reads，按“哪个细胞 barcode、哪个 UMI、哪个基因/feature”整理，最后生成一个可以给 Seurat / Scanpy 使用的表达矩阵。

官方对它的定位是：快速、准确、节省内存。它通常和 `piscem` 或 `salmon alevin` 搭配使用，先把 reads 映射成 RAD 文件，再由 `alevin-fry` 做 barcode correction、UMI resolution 和 count matrix 生成。

## 它现在流行吗？

`alevin-fry` 算是学术和开源生信圈里有影响力的工具，但不是 10x 数据分析里最默认的工具。

实际使用大概是这样：

| 场景 | 常见选择 |
|---|---|
| 10x 官方标准流程、实验室常规交付 | `Cell Ranger` 最常见 |
| 想要开源、快、省内存、可定制 | `alevin-fry` / `kallisto|bustools` / `STARsolo` |
| 计算生物学研究、方法比较、重新分析公开数据 | `alevin-fry` 很常见 |
| 医院、公司、平台标准报告 | 通常还是 `Cell Ranger` 更多 |

所以它不是没人用的小工具，但也不是像 `Cell Ranger` 那样的事实标准。

更准确地说：

> `alevin-fry` 是偏专业、偏研究型、偏高性能的主流替代方案之一。

## 和同类工具比较

| 工具            | 特点                      | 优点                                                                                      | 不足                                              |                                     |
| ------------- | ----------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------- |
| `Cell Ranger` | 10x 官方 pipeline         | 最稳妥，文档完整，和 Loupe / 10x 数据格式兼容最好，支持 GEX、VDJ、Feature Barcode 等                            | 资源消耗较大，灵活性较低，主要面向 10x 自家体系                      |                                     |
| `alevin-fry`  | 开源、高性能、偏灵活的定量工具         | 快、省内存，支持 scRNA/snRNA，适合重新定量、复杂 reference、spliced/unspliced/ambiguous 计数，适合 RNA velocity | 上手比 Cell Ranger 难，需要理解 reference、barcode、UMI 处理 |                                     |
| `kallisto     | bustools` / `kb-python` | 快速、轻量、开源                                                                                | 速度和内存表现很好，生态成熟，命令封装较方便                          | 某些协议和参数选择需要经验，结果可能和 Cell Ranger 有差异 |
| `STARsolo`    | 基于 STAR aligner 的单细胞流程  | 更接近传统 genome alignment 思路，和 STAR 生态兼容，结果常和 Cell Ranger 接近                               | 资源消耗一般比 pseudoalignment 类工具更高                   |                                     |
| `simpleaf`    | `alevin-fry` 生态的高级封装    | 把 alevin-fry 流程简化很多，适合实际跑数据                                                             | 本质上还是 alevin-fry 生态，需要理解参数                      |                                     |

## Alevin-fry 的主要优点

### 1. 速度快、内存低

`alevin-fry` 适合大规模单细胞数据，尤其是需要批量重跑公开数据时。

### 2. 开源、可复现、适合研究场景

它不依赖 10x 官方 pipeline 的固定设置，更容易做方法学比较和流程定制。

### 3. 对 Single-nucleus / Intronic Reads 更友好

`alevin-fry` 常配合 `splici` reference 使用，可以把 spliced、unspliced、ambiguous 信息分开统计。

这对下面这些分析很有用：

- single-nucleus RNA-seq
- RNA velocity
- 需要区分成熟 RNA 和未剪接 RNA 的分析

### 4. UMI Resolution 方法更灵活

`alevin-fry` 提供不同的 UMI 处理策略，例如：

- 类似 Cell Ranger 的 `cr-like`
- 带 EM / parsimony 思路的策略

这些策略可以帮助处理多重映射和有歧义的 reads。

### 5. 适合重新量化公开数据

如果你前面看到的 quantaf 项目，就是把 10x 网站上的数据重新用 `alevin-fry` 处理后，提供统一的量化结果。

这种场景下，`alevin-fry` 的优势是：

- 速度快
- 资源占用低
- 参数和流程更透明
- 方便批量处理多个公开数据集

## 什么时候该用它？

如果你只是下载 10x 页面上的 `filtered_feature_bc_matrix.h5` 做 Seurat / Scanpy 分析，暂时不需要 `alevin-fry`。

如果你有 FASTQ，想自己从头生成表达矩阵，或者想重新处理 10x 官方数据，可以考虑：

| 需求 | 推荐工具 |
|---|---|
| 新手、标准 10x 流程 | `Cell Ranger` |
| 想快、省资源、开源可控 | `simpleaf + alevin-fry` |
| 想和文献或方法学比较接轨 | 同时比较 `Cell Ranger`、`STARsolo`、`alevin-fry`、`kallisto|bustools` |

## 一句话总结

`alevin-fry` 是 `Cell Ranger` 的高性能开源替代方案之一，尤其适合研究型重分析、大规模数据、single-nucleus RNA-seq 和 RNA velocity 相关场景。

但如果只是常规 10x 分析，`Cell Ranger` 仍然是最常见的默认选择。
