这个用法对路了——nf-core 的 141 条 pipeline 就是一份**事实上的"现代生信分析方法目录"**，每一条都对应一个真实的生物学问题 + 一套业界共识的工具链。下面按领域给你梳理一份导览，每个领域我说三件事：**做什么、用什么 pipeline、典型工具栈和大致流程**。

## 1. 变异检测（Variant Calling）—— 制药最核心的一块

- **nf-core/sarek**：旗舰，germline + somatic 全覆盖，是 WGS/WES 的事实标准
- **nf-core/raredisease**：sarek 的扩展，加了 SV / 短串联重复 / repeat expansion 检测，临床罕见病专用
- **nf-core/oncoanalyser**：Hartwig Medical Foundation 那套癌症分析栈，肿瘤专项

**共同骨架**：FASTQ → FastQC → fastp/Trim Galore 修剪 → BWA-MEM2 或 DRAGMAP 比对 → MarkDuplicates → BQSR（GATK）→ 变异检测（GATK HaplotypeCaller / DeepVariant / Strelka2 / Mutect2 体细胞）→ 过滤 → 注释（VEP / snpEff / SnpSift）→ MultiQC 报告

**学完这一条你就掌握了**：测序数据从 raw read 到 annotated VCF 的全栈思路，这是基础到不能再基础的"圣经流程"。

## 2. Bulk RNA-seq

- **nf-core/rnaseq**：用 STAR、RSEM、HISAT2 或 Salmon 做 RNA-seq 分析，输出 gene/isoform counts 和完整的 QC 报告，是整个 nf-core 最被广泛使用的一条
- **nf-core/differentialabundance**：DE 分析下游（DESeq2 / limma）
- **nf-core/rnafusion**：融合基因检测（Arriba / STAR-Fusion / FusionCatcher），肿瘤药研常用
- **nf-core/rnasplice**：可变剪接（rMATS / SUPPA2 / DEXSeq）
- **nf-core/smrnaseq**：miRNA / 小 RNA

**共同骨架**：FASTQ → QC → trim → 比对（STAR / HISAT2）或伪比对（Salmon / Kallisto）→ 定量 → 多维 QC（RSeQC、Qualimap、dupRadar、Preseq）→ count matrix → DE 分析

**重点**：rnaseq 这条非常值得读，因为它展示了"同一个问题给出多种工具路径"的设计思路（user 通过 `--aligner` 切换 STAR/HISAT2/Salmon），是工程化设计的经典案例。

## 3. 单细胞与空间组学（现在制药重投入的方向）

- **nf-core/scrnaseq**：bulk single-cell（Cell Ranger / STARsolo / alevin-fry / kallisto-bustools 多路径）
- **nf-core/scnanoseq**：长读长单细胞
- **nf-core/spatialvi**：10x Genomics Visium 空间转录组，可以从原始数据走 Space Ranger 也可以接已处理数据
- **nf-core/molkart**：分子制图（MERFISH 那类成像空间组）

**骨架**：demultiplex → 比对 + UMI/barcode 计数 → 生成 cell × gene 矩阵 → 基础 QC（空 droplet 过滤、双胞剔除）

**关键认知**：单细胞 pipeline 通常只负责"到 count matrix 为止"。真正的归一化、整合、聚类、细胞类型注释通常在 scanpy / Seurat 里做，是另一个独立的 Python/R 生态。nf-core 帮你跑通前半段。

## 4. 表观组学（Epigenomics）

- **nf-core/chipseq**：转录因子 / 组蛋白修饰结合
- **nf-core/atacseq**：开放染色质区
- **nf-core/cutandrun**：CUT&RUN / CUT&Tag（ChIP 的现代替代）
- **nf-core/methylseq**：DNA 甲基化（bisulfite）

**共同骨架**：QC → 比对 → 去重 → peak calling（MACS2 / SEACR）→ peak 注释 → 差异结合分析（DiffBind）

四条放在一起看特别有启发——你会发现它们大体框架几乎一样，差别只在 peak caller 和后处理工具，这就是"分析家族"的概念。

## 5. 长读长（Long-read）

- **nf-core/nanoseq**：Nanopore DNA/RNA
- 长读长在 sarek、scrnaseq、metatdenovo 等也作为可选模式存在

**骨架**：basecall（有时） → minimap2 比对 → 长读专用工具（Sniffles for SV、Bambu for transcript quantification、Medaka for consensus）

## 6. 微生物组 / 宏基因组

- **nf-core/mag**：宏基因组组装 + 分箱（MAGs 重建）
- **nf-core/ampliseq**：16S / 18S / ITS 扩增子（QIIME2 / DADA2）
- **nf-core/taxprofiler**：分类学剖析，并行跑 Kraken2 / MetaPhlAn / Centrifuge 等多个分类器
- **nf-core/funcscan**：功能筛查（抗生素抗性基因 AMR、生物合成基因簇 BGC）
- **nf-core/metatdenovo**：宏转录组的 de novo 组装、定量、分类和功能注释，也能用于宏基因组数据但不包含 MAG 重建

整个微生物领域 pipeline 设计逻辑跟人类基因组完全不同——没有参考基因组的 assembly-centric 思维，值得专门花时间理解。

## 7. 蛋白组与免疫学

- **nf-core/quantms**：质谱定量蛋白组（OpenMS 生态）
- **nf-core/mhcquant**：免疫肽组（疫苗 / 肿瘤新抗原研究）
- **nf-core/airrflow**：B/T 细胞受体仓库分析（Immcantation 栈）
- **nf-core/hlatyping**：HLA 分型
- **nf-core/proteinfamilies**：蛋白家族构建

这一块对制药公司价值非常高，但跟测序数据分析的思路完全不同（质谱有自己的工具生态：OpenMS、MaxQuant、Percolator）。

## 8. 病原体 / 微生物分离株

- **nf-core/viralrecon**：病毒基因组重构（COVID 时代被广泛使用）
- **nf-core/bacass**：细菌基因组组装

## 9. 专项 / 小众

- **nf-core/crisprseq**：CRISPR 基因编辑与筛选的综合分析（涉及 indel 检测、CRISPR screen 富集分析）
- **nf-core/circdna** / **circrna**：环状 DNA / RNA
- **nf-core/hic**：染色质三维构象

## 10. 横切工具（这些是"管道的管道"）

- **nf-core/fetchngs**：从 SRA/ENA/GEO 拉公共数据自动生成 sample sheet——刚开始练手非常好用
- **nf-core/references**：参考基因组管理
- **nf-core/seqinspector**：批次间 QC

---

## "贯穿所有 Pipeline 的常用工具"——优先学这些

不管你最终做哪个方向，下面这套工具几乎每条 pipeline 都会出现，学一遍受益终身：

- **QC 通用**：FastQC、MultiQC（MultiQC 几乎是 nf-core 输出报告的标配，必看其文档）
- **修剪**：fastp、Trim Galore
- **BAM/VCF 操作**：samtools、bcftools、bedtools（生信"瑞士军刀"）
- **比对**：BWA-MEM2、minimap2、STAR、HISAT2、Bowtie2
- **变异**：GATK4、DeepVariant、bcftools
- **注释**：VEP、snpEff
- **容器化**：Docker / Singularity / Apptainer + BioContainers / Quay.io

## 怎么高效地"读" Nf-core 学生信

这是我建议的学习顺序，比单纯看代码效率高得多：

1. **先看 metro 地图**：每条 pipeline 的 README 顶部都有一张 metro-style 流程图（地铁线路图风格），五秒钟看懂整体结构。rnaseq 的图就是从 samplesheet → QC → trim → alignment 多路径 → 定量 → 报告的完整地铁图。
2. **再读 docs/output.md**：这个文件解释"每一步输出什么、为什么这么输出"，等于把整个分析的生物学逻辑串起来了。比读代码快十倍。
3. **看 docs/usage.md 里的参数解释**：参数选项背后都是分析的"决策点"——"为什么要选 STAR 而不是 HISAT2"、"什么时候用 Salmon"，这些 trade-off 文档里都有解释。
4. **最后才读 `modules/` 和 `subworkflows/`**：看具体怎么把工具串起来。这一步是工程视角，跟"学生信"已经分开了。
5. **横向对比**：把 chipseq、atacseq、cutandrun 三条放一起对比着读，能秒懂"这家族分析的共同范式"。

## 给你的具体建议路径

以你 Takeda 背景 + 已有的生信底子，我会建议这个顺序：

**第一梯队（必读，覆盖 80% 制药场景）** sarek → rnaseq → differentialabundance → scrnaseq

**第二梯队（按你具体方向挑）**

- 肿瘤：oncoanalyser、rnafusion
- 临床/罕见病：raredisease
- 免疫/疫苗：airrflow、mhcquant、hlatyping
- 空间/新型组学：spatialvi
- 表观：methylseq、atacseq

**直接去这里**：[nf-co.re/pipelines](https://nf-co.re/pipelines) 是官方目录，可以按主题、release status 筛选，每条 pipeline 都能点进去看完整的 metro map 和文档。

读完前 4-5 条你就会发现一个规律——**整个现代生信的分析范式高度收敛**：QC → 预处理 → 比对/量化 → 后处理 → 聚合 QC → 领域特定下游。掌握这个心智模型之后，遇到新 pipeline 就是"在已知框架上替换几个工具"，学习速度会指数级上升。