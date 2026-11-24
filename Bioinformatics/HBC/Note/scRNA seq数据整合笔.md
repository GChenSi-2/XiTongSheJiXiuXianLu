## scRNA-seq 数据整合（Integration）笔记

  

> 参考：[Seurat RPCA 整合教程](https://satijalab.org/seurat/articles/integration_rpca.html)、[HBC Training: Integration theory](https://hbctraining.github.io/Intro-to-scRNAseq/lessons/08_integration_theory.html)

  

---
### 1. CCA Vs RPCA

#### Seurat 的整合思路：锚点（anchors）

- 在不同数据集之间找出**彼此对应的细胞对**（同一细胞状态在不同批次里的细胞），作为锚点。

- 用锚点来校正批次效应。

- 默认找锚点的方法是 **CCA（典型相关分析）**：把两组数据投影到共享的低维空间，再找互为最近邻的细胞。

#### CCA 的问题

- **过度校正**：两组细胞组成相似时效果很好；但如果有某组独有的细胞类型（比如疾病特有的细胞群），CCA 可能把它们硬对齐到另一组的细胞上，抹掉真实的生物学差异。

- **慢**：细胞数量多时计算开销大。

#### RPCA（reciprocal PCA，互惠 PCA）

- 每个数据集**各自做 PCA**，再把 A 投影到 B 的 PC 空间、B 投影到 A 的 PC 空间（互惠），在这些空间里找互为最近邻的细胞作为锚点。

- 优点：

  - **更保守**：不容易把不同类型的细胞错误地对齐，适合“很多细胞在另一组里没有对应”的情况。

  - **更快**：适合大规模数据。

- 缺点：批次效应特别强时，可能整合得不够彻底，可以调大 `k.anchor` 增强整合强度。
#### 怎么选

| 情况 | 推荐 |
|---|---|
| 各组细胞组成相似 | CCA |
| 各组差异大（有很多独有细胞类型）/ 数据量很大 | RPCA |
Seurat v5 里通过 `IntegrateLayers(method = CCAIntegration)` 或 `RPCAIntegration` 切换。

---

### 2. 整合的原则：去批次 Vs 保留生物学差异

#### 核心矛盾

- **批次校正**：去掉技术因素造成的差异（测序批次、实验日期、平台、样本处理）。

- **保留生物学差异**：真实的细胞类型、细胞状态、疾病和健康之间的差异不能被抹掉。

- 校正太弱：同一种细胞按批次分开聚类。

- 校正太强（过度整合）：本来不同的细胞被混在一起。

#### 没有万能工具

- Seurat（CCA/RPCA）、Harmony、scVI、Scanorama、fastMNN 等方法在不同数据上表现差别很大（参考 benchmark：Luecken et al. 2022）。

- 影响因素：批次效应强弱、各批次细胞类型的重叠程度、数据量。

- 复杂数据往往要**多试几种方法，比较结果**。

#### 推荐流程：先分开分析 → 再整合 → 再验证

1. **整合前**：每个批次单独聚类、单独注释细胞类型，作为参照（ground truth）。

2. **整合后检查**：

   - 同一种细胞类型应该跨批次混在一起 → 批次效应已去除

   - 不同细胞类型应该依然分开 → 生物学差异保留

   - 只在某个批次出现的细胞类型应该保持独立 → 没有过度校正

1. 常用评估指标：kBET、LISI、ASW（一类衡量批次混合程度，一类衡量细胞类型分离程度）。


> 不先做独立注释的话，没法判断“混在一起”是校正成功还是过度校正。

  

---


### 3. 术语：Interoperability（互操作性）
  

- **含义**：不同系统、软件或工具之间能互相配合、交换数据、协同工作的能力。inter-（相互之间）+ operability（可操作性）。

- 日语：相互運用性 / インターオペラビリティ。

- 例子：

  - 生信：Seurat（R）↔ Scanpy（Python）之间可以转换格式（`SeuratDisk`、`anndata2ri`）。

  - 软件开发：前后端通过统一的 API 格式（JSON）通信。

  - 金融：不同银行都按同一套电文标准（如全銀システム）收发报文。

  
#### “Interoperability With the Seurat workflow”

指一个工具（如 Harmony）能**直接嵌进 Seurat 的标准流程**：

- 输入直接是 Seurat 对象，不需要转换格式；

- 结果作为新的降维（如 `"harmony"`）存回同一个对象；

- 下游的 `FindNeighbors`、`FindClusters`、`RunUMAP`、`DimPlot` 都能直接接上。

  

```r

seu <- RunHarmony(seu, group.by.vars = "batch")

seu <- FindNeighbors(seu, reduction = "harmony", dims = 1:30)

seu <- FindClusters(seu)

seu <- RunUMAP(seu, reduction = "harmony", dims = 1:30)

```

  

很多 Python 工具（scVI、Scanorama）要在 R 和 Python 之间转格式，麻烦也容易出错（元数据丢失、基因名不对应）。

  

---


### 4. 用 SCTransform 回归批次效应

#### 写法：`vars.to.regress`

```r

seu <- SCTransform(seu, vars.to.regress = "batch", verbose = FALSE)

  

# 同时回归多个变量

seu <- SCTransform(seu, vars.to.regress = c("batch", "percent.mt"))

```

  

**原理**：SCTransform 先用正则化负二项回归对每个基因建模，得到 Pearson 残差；`vars.to.regress` 里的变量再做一次**线性回归**，从残差中减掉。


#### 为什么一般不推荐用它去批次

1. **只能去掉线性、全局的效应**：真实的批次效应往往因细胞类型而异，线性回归处理不了。

2. **会误伤生物学差异**：批次和生物学因素混在一起时（比如批次1全是疾病、批次2全是健康，或者各批次细胞组成不同），会把真实差异一起减掉。

3. Seurat 官方建议：回归适合处理**细胞周期、线粒体比例**这类细胞层面的干扰变量；跨样本或跨批次的差异用**整合**来处理。

#### 推荐做法：分批次 SCTransform + 整合（Seurat v5）

```r

# 按批次拆分 layers

seu[["RNA"]] <- split(seu[["RNA"]], f = seu$batch)

  

# 每个批次分别建模

seu <- SCTransform(seu, vars.to.regress = "percent.mt")

seu <- RunPCA(seu)

  

# 整合（可选 CCAIntegration / RPCAIntegration / HarmonyIntegration）

seu <- IntegrateLayers(

  seu,

  method = RPCAIntegration,

  normalization.method = "SCT",

  new.reduction = "integrated.rpca"

)

  

seu <- FindNeighbors(seu, reduction = "integrated.rpca", dims = 1:30)

seu <- FindClusters(seu)

seu <- RunUMAP(seu, reduction = "integrated.rpca", dims = 1:30)

```

  

| 情况 | 做法 |
|---|---|
| 批次效应很弱、各批次细胞组成几乎一样 | `vars.to.regress = "batch"` 可以用 |
| 大多数真实数据 | 分批次 SCTransform → Harmony / RPCA / CCA 整合 → 用事先的注释检查 |

---

  
### 5. 案例：HBC 教程里的 LYZ / 单核细胞

  
#### 数据集：两组都是完整的 PBMC，不是只有单核细胞

Kang et al. 2018：

- **ctrl 组**：未处理的 PBMC

- **stim 组**：同一批供体的 PBMC，体外用 **IFN-β 刺激约 6 小时**

  

两组细胞组成基本一样，都包含 PBMC 里的常见细胞类型：

- T 细胞（CD4⁺、CD8⁺，再细分为 naive、memory 等）

- B 细胞

- NK 细胞

- 单核细胞（CD14⁺ 经典单核细胞、FCGR3A/CD16⁺ 非经典单核细胞）

- 树突状细胞（DC、pDC）

- 巨核细胞 / 血小板等

两组的差别**只在于是否用干扰素处理**。
**为什么教程只拿单核细胞举例**

- **好认**：LYZ、CD14 这些 marker 很特异，在 PCA / UMAP 上一眼就能找到。

- **反应明显**：单核细胞对干扰素反应很强，ctrl 和 stim 分开得特别清楚，适合演示“同一类细胞被样本拉开”。

- 其他细胞类型（T、B、NK 等）也有同样的现象：每一类都会按 ctrl / stim 分成两团，因为 ISG 上调在几乎所有细胞类型里都会发生。单核细胞只是最直观的例子。

**整合后的期望**：各细胞类型按身份聚在一起（ctrl 和 stim 的 T 细胞在同一团、单核细胞在同一团……），再在每个细胞类型内部比较 ctrl 和 stim，看干扰素对不同细胞的影响有什么不同。这也是这个数据集常被用来演示“条件间差异分析”的原因。

#### 教程的论证

- 图：未整合的 PCA，左边按 `sample` 上色，右边是 `LYZ` 的 FeaturePlot。

- 逻辑：

  1. LYZ 高 → 单核细胞；两组 LYZ 表达差不多 → 两组的单核细胞是同一类细胞。

  2. 同一类细胞在 PCA 里应该落在同一个区域。

  3. 但实际上，LYZ 高的细胞分成两团，各自对应一个样本 → **由样本驱动的分离 → 需要整合**。

> 关键：这张图看的是**细胞在 PCA 里的位置**，不是表达量高低。marker 表达相同才能说明“是同一类细胞”；如果表达差别很大，反而没法判断分离是批次效应还是生物学差异。

#### 为什么选 LYZ 当 Marker

- IFN-β 刺激主要改变的是**干扰素刺激基因（ISG）**：`ISG15`、`IFI6`、`IFIT1`、`MX1` 等，在 stim 组几乎所有细胞类型里都大幅上调。

- LYZ（溶菌酶）是**谱系 marker**，代表“髓系/单核细胞”这一身份，受刺激影响相对小。

- 选 marker 的原则：**定义细胞身份、跨条件保持稳定**的基因，而不是随处理变化的基因。
#### 为什么 PCA 里会分开

- PCA 是用几千个高变基因算出来的，不是只看 LYZ。

- stim 组大量 ISG 一起上调，在 PCA 上形成很强的方向，把 stim 的所有细胞整体推开。
#### 注意：这里的“批次效应”混着真实生物学差异

- ctrl 和 stim 的分离**不纯是技术批次效应**，有很大一部分是干扰素处理造成的真实差异；同时两组是分开处理和上机的，也带有技术差异。

- 处理条件和批次**混在一起（confounded）**，没法完全分开。

- 教程仍然要整合，目的是：

  1. 先把两组里**相同的细胞类型对齐**，统一聚类、统一注释；

  2. 再在**每个细胞类型内部**比较 ctrl 和 stim，找受刺激影响的基因。
#### ⚠️ 差异表达分析时的注意事项

整合只改变用于聚类和可视化的降维空间（或 integrated assay）。**做 ctrl vs stim 的差异表达时，要用原始或标准化后的表达值（RNA assay），不能用整合校正后的值**，否则真实的刺激效应可能已经被抹掉一部分。

---

### 总结

- **CCA**：细胞组成相似时用；**RPCA**：差异大或数据量大时用，更保守、更快。

- 整合 = 在去批次和保留生物学差异之间找平衡；先逐批次注释，整合后再验证。

- **Interoperability** = 互操作性；“兼容 Seurat 流程”指能直接用 Seurat 对象、即插即用。

- SCTransform 的 `vars.to.regress` 只能去掉线性效应，跨批次差异优先用整合。

- HBC 教程数据：ctrl 和 stim 都是完整的 PBMC（多种细胞类型），区别只在 IFN-β 刺激；单核细胞只是最直观的例子。

- marker 要选稳定的谱系基因；条件和批次混在一起时，先整合对齐细胞类型，再在细胞类型内部做差异分析（用未校正的表达值）。