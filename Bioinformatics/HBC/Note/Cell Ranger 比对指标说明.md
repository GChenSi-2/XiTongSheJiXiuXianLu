# Cell Ranger 比对指标（Mapping Metrics）说明

## 一、各项指标含义

Cell Ranger 输出的 `metrics_summary.csv` 中包含以下一组反映测序 reads 比对情况的指标：

|指标|数值|
|---|---|
|Reads Mapped to Genome|97.0%|
|Reads Mapped Confidently to Genome|95.6%|
|Reads Mapped Confidently to Intergenic Regions|1.9%|
|Reads Mapped Confidently to Intronic Regions|14.4%|
|Reads Mapped Confidently to Exonic Regions|79.3%|
|Reads Mapped Confidently to Transcriptome|88.2%|
|Reads Mapped Antisense to Gene|5.2%|

**Reads Mapped to Genome（97.0%）** 所有测序 reads 中，能够比对到参考基因组上（不管是唯一比对还是多重比对，也不管置信度高低）的比例，是最宽泛的统计口径。

**Reads Mapped Confidently to Genome（95.6%）** 在能比对到基因组的 reads 中，进一步筛选出"高置信度唯一比对"（unique mapping，MAPQ 高，非多重比对到基因组多个位置）的比例。这是后续几项指标的基础。

以下三项是"高置信度比对到基因组"的 reads 具体落在基因组的哪个区域，三者相加约等于 95.6%（1.9% + 14.4% + 79.3% ≈ 95.6%）：

- **Reads Mapped Confidently to Intergenic Regions（1.9%）**：落在基因间区（不属于任何已知基因的区域）的比例，通常被认为是背景/非功能区域。
- **Reads Mapped Confidently to Intronic Regions（14.4%）**：落在基因内含子（intron）区域的比例。对于单细胞 3′端测序（如 10x 3′ 化学试剂），一定比例的 intronic reads 是正常的，部分来自未剪接的 pre-mRNA（这也是为什么做 RNA velocity 或核内 RNA/单核测序 snRNA-seq 时会特别关注 intronic reads，甚至将其计入表达量）。
- **Reads Mapped Confidently to Exonic Regions（79.3%）**：落在外显子（exon）区域的比例，是最理想的、通常被直接用于基因表达定量的部分。

**Reads Mapped Confidently to Transcriptome（88.2%）** 这是另一个独立统计口径：在"高置信度比对到基因组"的 reads 中，能够进一步比对到转录组注释（即明确对应到某个基因的转录本、且方向正确/sense strand）上的比例。它比单纯的 Exonic（79.3%）略高，是因为 Cell Ranger 在计算 Transcriptome 比对时，对跨越剪接位点的 reads 也会尝试比对到成熟 mRNA（拼接后的转录本），因此会把一部分能够正确跨越 exon-exon junction 的 reads 也计入。**这个指标才是最终用来生成基因表达矩阵（counts matrix）的 reads 比例，是最关键的一个 QC 指标。**

**Reads Mapped Antisense to Gene（5.2%）** 比对到某个基因位置，但方向与该基因转录方向相反（反义链）的 reads 比例。理论上大部分测序方案（链特异性建库）reads 应该主要是正义链（sense），如果 antisense 比例偏高，可能提示存在双链 RNA、重叠基因、建库/测序中的技术问题，或部分是生物学上真实存在的反义转录本。这个数值不计入表达定量，通常作为质量参考。

## 二、指标间的逻辑关系

```
总 reads
 └─ 97.0% 比对到基因组（Mapped to Genome）
     └─ 95.6% 高置信度唯一比对（Mapped Confidently to Genome）
         ├─ 1.9%  基因间区 Intergenic
         ├─ 14.4% 内含子区 Intronic
         └─ 79.3% 外显子区 Exonic

（另一独立统计口径）
 └─ 88.2% 高置信度比对到转录组（Mapped Confidently to Transcriptome）
     → 用于最终生成基因表达矩阵

（不计入表达定量，仅作质量参考）
 └─ 5.2% 反义链比对（Mapped Antisense to Gene）
```

一般判断数据质量好坏时，主要看 **Reads Mapped Confidently to Transcriptome** 是否足够高（通常期望 >60–70%，本例 88.2% 属于相当不错），以及 intronic/antisense 比例是否在合理范围内（过高可能提示 RNA 降解、基因组 DNA 污染，或核内 RNA 比例较高等问题）。

---

# 为什么理论上 10x 3′ 建库的 reads 应主要是正义链（Sense Strand）

这是由 10x Genomics 3′ 建库方案的分子机制——即"链特异性建库（strand-specific library prep）"——决定的。

## 第一步：反转录引物的设计决定了起始方向

10x 3′ 化学试剂的凝胶珠（gel bead）上固定的引物结构是：Illumina 接头 + 16bp 细胞条形码（cell barcode）+ UMI + 一段 poly-dT（多聚 T）序列。这段 poly-dT 只能与 mRNA 3′端的 poly-A 尾巴互补配对。因此反转录（RT）只会从 mRNA 的 3′端开始，以 mRNA 为模板，向 5′端方向延伸合成第一链 cDNA。

## 第二步：template switching 锁定另一端

当反转录酶（带有模板转换活性的 MMLV 逆转录酶）合成到 mRNA 5′端帽子结构附近时，会发生"模板转换"（template switching），跳转到另一条模板转换寡核苷酸（TSO）上继续延伸，从而在第一链 cDNA 的末端加上一段固定的 TSO 序列。

这样一来，每条 cDNA 分子的两端就被严格定义好了：一端固定是"条形码 + UMI + poly-dT"（对应 mRNA 3′端），另一端固定是 TSO 序列（对应 mRNA 5′端）。整个分子的方向不是随机的，而是由引物结合位点唯一决定的。

## 第三步：测序读取的方向也因此被固定

后续 PCR 扩增、片段化、加接头之后上机测序时，Read 1 读取条形码/UMI 那一端，Read 2（真正测序 cDNA 插入片段、用于比对基因组/转录组的那条 read）是从 TSO 那一端向条形码方向读取的。由于第一链 cDNA 本身是 mRNA 的互补链，Read 2 读取的正好是与第一链互补的那条链——也就是和原始 mRNA 序列一致的那条链，即"正义链（sense strand）"。

## 核心逻辑

因为整个建库过程从头到尾都是"定向"的（poly-dT 只结合 poly-A 尾巴，TSO 只在特定位置加上），所以生成的每一个 cDNA 片段相对于基因的方向都是确定的、一致的，不像某些非链特异性（non-stranded）建库方案那样，reads 来自哪条链是随机/不可区分的。这就是为什么理论上、在建库化学正确工作的前提下，几乎所有 reads 都应该比对到基因的正义链方向。

## 那为什么实际还会有约 5% antisense？

理论是"应该几乎全是 sense"，但实际测出来总会有一小部分 antisense，原因通常包括：

- 真实存在的天然反义转录本（antisense RNA，生物学上确实存在，部分基因位点两条链都有转录活性）
- 基因组上正负链基因存在重叠区域，导致比对时被错误地标记为 antisense
- poly-dT 引物发生了"内部错误起始"（internal priming），结合到了基因组或转录本内部富含 A 的区域而非真正的 poly-A 尾巴，导致读取方向出错
- 双链 cDNA 合成或建库过程中的技术性链交换/交叉污染

所以 5.2% 这个数值本身是正常范围内的背景值，不算高；如果这个比例明显偏高（比如 >10–15%），才需要怀疑建库或 RNA 质量出了问题。

---

## 三、生物信息类专用术语中英文对照

| 类别    | 中文术语/本文写法           | 英文对照                                           | 简要说明                                 |
| ----- | ------------------- | ---------------------------------------------- | ------------------------------------ |
| 软件/输出 | Cell Ranger         | Cell Ranger                                    | 10x Genomics 单细胞测序数据预处理与定量软件。        |
| 软件/输出 | metrics_summary.csv | metrics summary CSV                            | Cell Ranger 输出的关键 QC 指标汇总文件。         |
| 测序数据  | 测序读段 / reads        | sequencing reads                               | 测序仪产生的短序列片段，是比对和定量的基本单位。             |
| 比对    | 比对 / 映射             | alignment / mapping                            | 将 reads 放到参考基因组或转录组上的过程。             |
| 比对    | 参考基因组               | reference genome                               | 用于 reads 比对的标准基因组序列。                 |
| 比对指标  | 比对到基因组比例            | Reads Mapped to Genome                         | 能比对到参考基因组的 reads 比例。                 |
| 比对指标  | 高置信度比对到基因组比例        | Reads Mapped Confidently to Genome             | 唯一且高质量地比对到基因组的 reads 比例。             |
| 比对指标  | 高置信度比对到基因间区比例       | Reads Mapped Confidently to Intergenic Regions | 唯一高质量落在基因间区的 reads 比例。               |
| 比对指标  | 高置信度比对到内含子区比例       | Reads Mapped Confidently to Intronic Regions   | 唯一高质量落在内含子区的 reads 比例。               |
| 比对指标  | 高置信度比对到外显子区比例       | Reads Mapped Confidently to Exonic Regions     | 唯一高质量落在外显子区的 reads 比例。               |
| 比对指标  | 高置信度比对到转录组比例        | Reads Mapped Confidently to Transcriptome      | 可进一步对应到转录本注释、通常用于生成表达矩阵的 reads 比例。   |
| 比对指标  | 反义链比对到基因比例          | Reads Mapped Antisense to Gene                 | 方向与基因转录方向相反的 reads 比例。               |
| 比对质量  | 唯一比对                | unique mapping                                 | read 主要匹配到一个基因组位置。                   |
| 比对质量  | 多重比对                | multi-mapping                                  | read 可匹配到多个基因组位置，通常置信度较低。            |
| 比对质量  | MAPQ / 比对质量值        | mapping quality                                | 衡量比对位置可信度的评分。                        |
| 基因结构  | 基因间区                | intergenic region                              | 两个基因之间、不属于已注释基因主体的区域。                |
| 基因结构  | 内含子 / 内含子区          | intron / intronic region                       | 基因中通常会在成熟 mRNA 中被剪接去除的区域。            |
| 基因结构  | 外显子 / 外显子区          | exon / exonic region                           | 成熟 mRNA 中保留、常用于表达定量的区域。              |
| 转录本   | 转录组注释               | transcriptome annotation                       | 基因和转录本的位置、结构、方向等注释信息。                |
| 转录本   | 转录本                 | transcript                                     | 由基因转录产生的 RNA 产物，或参考注释中的转录模型。         |
| 转录本   | 成熟 mRNA             | mature mRNA                                    | 完成剪接后的 mRNA。                         |
| 转录本   | 未剪接 pre-mRNA        | unspliced pre-mRNA                             | 尚未完成剪接、仍含内含子的前体 mRNA。                |
| 剪接    | 外显子-外显子连接           | exon-exon junction                             | 剪接后相邻外显子形成的连接位点。                     |
| 定量/QC | 基因表达矩阵              | gene expression matrix / counts matrix         | 细胞 × 基因的 read 或 UMI 计数矩阵。            |
| 定量/QC | 表达定量                | expression quantification                      | 估计基因在样本或细胞中的表达量。                     |
| 定量/QC | 质量控制指标              | quality control metric / QC metric             | 用于判断数据质量的统计指标。                       |
| 单细胞   | 单细胞 3′端测序           | single-cell 3′-end sequencing                  | 主要捕获 mRNA 3′端信息的单细胞 RNA-seq 方案。      |
| 单细胞   | 10x 3′ 化学试剂 / 建库    | 10x Genomics 3′ chemistry / library prep       | 10x Genomics 的 3′端单细胞建库方案。           |
| 单细胞   | 单核测序                | single-nucleus RNA-seq / snRNA-seq             | 以细胞核而非完整细胞为输入的 RNA-seq。              |
| 分析方法  | RNA velocity        | RNA velocity                                   | 利用成熟和未剪接 RNA 信息推断细胞转录动态的方法。          |
| 链方向   | 正义链                 | sense strand                                   | 与转录本序列方向一致的链。                        |
| 链方向   | 反义链                 | antisense strand                               | 与基因或转录本方向相反的链。                       |
| 链方向   | 反义转录本 / 反义 RNA      | antisense transcript / antisense RNA           | 从相反链转录出的 RNA。                        |
| 建库    | 链特异性建库              | strand-specific library prep                   | 能保留 RNA 来源链方向信息的建库方法。                |
| 建库    | 凝胶珠                 | gel bead                                       | 10x 系统中携带条形码引物的微珠。                   |
| 建库    | 细胞条形码               | cell barcode                                   | 用于标识 read 来源细胞的 barcode。             |
| 建库    | UMI                 | unique molecular identifier                    | 标记原始 RNA 分子的分子标签，用于去重和校正 PCR 扩增偏差。   |
| 建库    | Illumina 接头         | Illumina adapter                               | Illumina 测序平台所需的接头序列。                |
| 建库    | poly-dT 引物          | poly-dT primer                                 | 与 mRNA poly-A 尾互补结合的引物。              |
| 建库    | poly-A 尾巴           | poly-A tail                                    | mRNA 3′端的连续 A 序列。                    |
| 建库    | 反转录                 | reverse transcription / RT                     | 以 RNA 为模板合成 cDNA 的过程。                |
| 建库    | cDNA                | complementary DNA                              | 由 RNA 反转录得到的互补 DNA。                  |
| 建库    | 模板转换                | template switching                             | 逆转录到 RNA 5′端附近时切换到 TSO 的过程。          |
| 建库    | MMLV 逆转录酶           | MMLV reverse transcriptase                     | 常用于模板转换反应的逆转录酶。                      |
| 建库    | 模板转换寡核苷酸            | template-switching oligonucleotide / TSO       | 模板转换时接入 cDNA 末端的寡核苷酸。                |
| 建库    | PCR 扩增              | PCR amplification                              | 通过 PCR 放大 cDNA 文库的过程。                |
| 测序读取  | Read 1              | Read 1                                         | 在 10x 3′方案中通常读取 cell barcode 和 UMI。  |
| 测序读取  | Read 2              | Read 2                                         | 通常读取 cDNA 插入片段，并用于基因组或转录组比对。         |
| 异常/质量 | 内部错误起始              | internal priming                               | poly-dT 在非真正 poly-A 尾的富 A 区域错误结合并起始。 |
| 异常/质量 | RNA 降解              | RNA degradation                                | RNA 断裂或质量下降，可能影响比对和定量指标。             |
| 异常/质量 | 基因组 DNA 污染          | genomic DNA contamination                      | DNA 混入 RNA 样本，可能造成异常比对信号。            |
| 异常/质量 | 重叠基因                | overlapping genes                              | 不同基因在基因组坐标上存在部分重叠，可能影响链方向判定。         |