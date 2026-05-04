
GMS22218133 4Month F1 sample type spa
<https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSM2221813>

---

## 生信分析流程软件与参数汇总

| 分析步骤             | 软件（版本）                          | 主要参数 / 说明                                                                                                 |
| ---------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **接头修剪**         | Trimmomatic (v0.32)             | 适配器文件：`TruSeq3-SE.fa`；最短读长：`MINLEN:50`；种子错配数：2；保留 50–100 bp 的读段                                           |
| **序列比对**         | TopHat (v2.0.13)                | 参考基因组：GRCm38 (mm10)；`--read-mismatches 3`；`--read-edit-dist 3`；注释文件：`--GTF Mus_musculus.GRCm38.68.gtf`    |
| **比对后处理**        | SAMtools                        | 对比对结果进行过滤、排序与索引；仅保留唯一比对至单一基因的读段                                                                           |
| **基因定量（计数）**     | easyRNASeq（Bioconductor v3.0.2） | 汇总方式：`geneModels summarization`                                                                           |
| **差异表达分析**       | DESeq2 (v1.8.1)                 | 默认参数；多重检验校正方法：Benjamini-Hochberg FDR；比较组：不同年龄雌雄小鼠                                                         |
| **表达量归一化（FPKM）** | Cufflinks (v2.1.1)              | `--no-effective-length-correction`；`--max-bundle-length 10000000`；注释文件：`--GTF Mus_musculus.GRCm38.68.gtf` |

> **参考基因组**：mm10（GRCm38）
> **基因注释**：Mus_musculus.GRCm38.68.gtf

---

## 分析思路总结

本研究采用标准的 **bulk RNA-seq** 分析流程，目的是研究**不同年龄、不同性别小鼠**之间的基因差异表达。整体思路分为以下四个阶段：

### 1. 数据预处理（质控与清洗）
原始 Illumina 测序数据首先经过质量控制，使用 Trimmomatic 去除接头污染并过滤低质量读段。设置最短读长 50 bp 的阈值，目的是剔除过短片段以减少后续比对的假阳性，最终保留 50–100 bp 的高质量读段用于下游分析。

### 2. 参考基因组比对
清洗后的读段通过 TopHat 比对至小鼠参考基因组 GRCm38（mm10）。TopHat 支持**剪接位点感知比对**，适合真核生物 mRNA 的 RNA-seq 分析。同时引入 GTF 注释文件辅助比对，并适当放宽错配限制（最多 3 个碱基错配），以应对测序错误和个体遗传变异。

### 3. 基因定量（两种策略并行）
本研究同时采用了两种互补的定量方式：

- **Read Count（读段计数）**：使用 SAMtools 对比对结果过滤并保留唯一比对读段，再通过 easyRNASeq 对每个基因进行计数。这种方式产生的整数计数矩阵是差异表达分析的输入。
- **FPKM 归一化**：使用 Cufflinks 对表达量进行基因长度和测序深度的双重归一化，生成 FPKM 值，适合样本间**表达水平的直观比较与可视化**。

### 4. 差异表达分析
以 easyRNASeq 生成的 Count 矩阵为输入，DESeq2 基于**负二项分布模型**对不同年龄和性别的小鼠组进行差异分析。采用 Benjamini-Hochberg 方法校正多重检验，控制假发现率（FDR），从而筛选出统计显著的差异表达基因（DEG）。

```
原始 FASTQ
    │
    ▼ Trimmomatic（质控 + 去接头）
清洗后读段
    │
    ▼ TopHat（比对至 GRCm38）
BAM 文件
    │
    ▼ SAMtools（过滤唯一比对读段）
    ├──▶ easyRNASeq → Count 矩阵 → DESeq2 → 差异表达基因
    └──▶ Cufflinks → FPKM → 表达量可视化 / 比较
```

---

## Analysis Workflow Overview

This study follows a standard **bulk RNA-seq** pipeline to investigate differential gene expression across **mice of different ages and sexes**. The workflow is organized into four major stages:

### 1. Data Pre-processing (Quality Control & Trimming)
Raw Illumina sequencing reads were first subjected to quality control using Trimmomatic. Adapter sequences were removed using the `TruSeq3-SE.fa` file, and a minimum read length of 50 bp was enforced to filter out short, low-quality fragments. Only reads between 50 and 100 bp were retained for downstream analysis, reducing noise and potential alignment artifacts.

### 2. Genome Alignment
Trimmed reads were aligned to the mouse reference genome GRCm38 (mm10) using TopHat, a splice-aware aligner well-suited for eukaryotic RNA-seq data. A GTF annotation file was provided to guide the alignment, and up to 3 mismatches per read were permitted to accommodate sequencing errors and natural genetic variation.

### 3. Gene Quantification (Two Parallel Strategies)
Two complementary quantification approaches were applied simultaneously:

- **Read Count**: SAMtools was used to filter, sort, and index the alignments, retaining only uniquely mapped reads. easyRNASeq then counted reads overlapping each annotated gene using `geneModels` summarization. The resulting integer count matrix serves as input for differential expression analysis.
- **FPKM Normalization**: Cufflinks generated FPKM values by normalizing for both gene length and sequencing depth, enabling intuitive **cross-sample expression level comparisons and visualization**.

### 4. Differential Expression Analysis
Using the count matrix from easyRNASeq, DESeq2 applied a **negative binomial model** to identify differentially expressed genes (DEGs) between groups of mice stratified by age and sex. Multiple testing correction was performed using the Benjamini-Hochberg procedure to control the false discovery rate (FDR).

```
Raw FASTQ
    │
    ▼ Trimmomatic (QC + adapter trimming)
Trimmed reads
    │
    ▼ TopHat (align to GRCm38)
BAM file
    │
    ▼ SAMtools (filter uniquely mapped reads)
    ├──▶ easyRNASeq → Count matrix → DESeq2 → DEGs
    └──▶ Cufflinks → FPKM → Expression comparison / visualization
```