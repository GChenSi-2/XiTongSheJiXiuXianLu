# scVI 整合代码详解：setup_anndata 与模型构建

## 目录

1. [原始代码](#1-原始代码)
2. [逐行解释](#2-逐行解释)
3. [常见疑问：batch_key 和 categorical_covariate_keys 有什么区别？](#3-常见疑问batch_key-和-categorical_covariate_keys-有什么区别)
4. [后续步骤](#4-后续步骤)

---

## 1. 原始代码

```python
# Create new anndata for integration
adata_integrated = adata_phase.copy()

# Set parameters for the scVI model
scvi.model.SCVI.setup_anndata(adata_integrated,
                              layer = "counts",
                              batch_key = "sample",
                              categorical_covariate_keys = ["phase", "mitoFr"])

model = scvi.model.SCVI(adata_integrated,
                        n_layers = 2,
                        n_latent = 30,
                        gene_likelihood = "nb")
model
```

这段代码分三步：**复制数据 → 告诉 scVI 用哪些字段 → 构建模型（尚未训练）**。

---

## 2. 逐行解释

### 2.1 复制数据

```python
adata_integrated = adata_phase.copy()
```

- 把 `adata_phase` 深拷贝一份，命名为 `adata_integrated`，后续整合都在副本上进行。
- **为什么要拷贝**：`setup_anndata` 会往 AnnData 里写注册信息（如 `adata.uns["_scvi_..."]`）。在副本上操作可以保持原始数据不变，方便以后换参数重跑。

### 2.2 注册数据字段：`setup_anndata`

```python
scvi.model.SCVI.setup_anndata(adata_integrated,
```

- 这是一个**类方法**。它不训练任何东西，只负责告诉 scVI：AnnData 中哪些字段用作输入、哪些用作协变量。
- 构建模型之前**必须**先调用。

```python
                              layer = "counts",
```

- 指定使用 `adata.layers["counts"]` 作为表达矩阵，而不是 `adata.X`。
- scVI 要求输入**原始整数 count**，因为它用负二项等计数分布建模。`adata.X` 通常已经做过 normalize / log1p，不能直接用。
- 常见做法：在归一化之前先备份原始计数：

  ```python
  adata.layers["counts"] = adata.X.copy()
  ```

```python
                              batch_key = "sample",
```

- 用 `adata.obs["sample"]` 作为批次标签，每个样本算一个 batch。
- 模型会学习各个 batch 带来的技术差异，使潜在空间（latent space）中尽量不含样本间的批次效应。这是"整合"（integration）的核心。

```python
                              categorical_covariate_keys = ["phase", "mitoFr"])
```

- 额外的**分类型协变量**，它们的影响会和 batch 一样被模型扣除：
  - `phase`：细胞周期阶段（G1 / S / G2M），一般来自 `sc.tl.score_genes_cell_cycle`。加入它表示不希望细胞因为所处周期不同而在潜在空间中分开。
  - `mitoFr`：线粒体 reads 比例。

> ⚠️ **注意事项**
>
> 1. **`mitoFr` 的数据类型**：如果 `mitoFr` 是连续的小数（如 0.032、0.051……），放进 `categorical_covariate_keys` 后会被当成分类变量，**每个不同的值都成为一个类别**，类别数可能有几千个，这是错误用法。连续值应改放到 `continuous_covariate_keys=["mitoFr"]`。只有事先分好箱（如 `low / mid / high`）时，放在 categorical 里才合理。
> 2. **扣除细胞周期的代价**：把细胞周期作为协变量去除，等于把增殖相关的生物学信号也一起去掉了。如果研究问题和增殖有关（如干细胞、肿瘤增殖亚群），需要考虑是否真的要扣除。

### 2.3 创建模型

```python
model = scvi.model.SCVI(adata_integrated,
```

- 基于已注册的 `adata_integrated` 实例化一个 SCVI 模型。
- SCVI 本质上是一个**变分自编码器（VAE）**：
  - **编码器**：把每个细胞的表达压缩成低维潜在向量 z；
  - **解码器**：结合 z、batch 和协变量，重建出表达量。

```python
                        n_layers = 2,
```

- 编码器和解码器各用 **2 层隐藏层**（默认 1 层），网络更深、表达能力更强。
- 每层的节点数由 `n_hidden` 控制，默认 128。

```python
                        n_latent = 30,
```

- 潜在空间维度设为 **30**（默认 10），作用类似 PCA 中保留的主成分个数。
- 数据量大、细胞类型复杂时，常用 20–30。

```python
                        gene_likelihood = "nb")
```

- 基因表达的似然分布用**负二项分布（Negative Binomial）**，默认是 `"zinb"`（零膨胀负二项）。
- 目前较普遍的看法是：对于 UMI 类数据（10x 等），NB 已足以解释其中的零值，额外的零膨胀项并非必需，因此很多教程直接用 `"nb"`。

```python
model
```

- 在 Jupyter 中直接显示模型摘要，包括上述参数、似然分布、潜在维度，以及 `Training status: Not Trained`。
- 此时模型**只是搭好了，还没有训练**。

### 2.4 参数速查表

| 参数 | 本例取值 | 默认值 | 含义 |
|---|---|---|---|
| `layer` | `"counts"` | `None`（用 `adata.X`） | 输入的原始计数矩阵 |
| `batch_key` | `"sample"` | `None` | 主要的整合轴（批次） |
| `categorical_covariate_keys` | `["phase", "mitoFr"]` | `None` | 额外扣除的分类型干扰因素 |
| `continuous_covariate_keys` | 未设置 | `None` | 额外扣除的连续型干扰因素 |
| `n_layers` | 2 | 1 | 编码器 / 解码器的隐藏层数 |
| `n_hidden` | 未设置 | 128 | 每层隐藏层的节点数 |
| `n_latent` | 30 | 10 | 潜在空间维度 |
| `gene_likelihood` | `"nb"` | `"zinb"` | 表达量的似然分布 |

---

## 3. 常见疑问：batch_key 和 categorical_covariate_keys 有什么区别？

> **疑问**：`batch_key` 和 `categorical_covariate_keys` 都是用来消除它们带来的差异的，为什么要分别放？

### 3.1 结论先行

**从"把影响扣掉"这个效果看，两者几乎一样。** 在 scVI 的网络里，batch 和分类型协变量都作为额外输入接进**解码器（decoder）**。解码器负责"解释"它们带来的表达差异，潜在空间 z 里就不用再记住这些差异。

真正的区别在三个地方：**语义**、**只能有一个**、以及 **scvi-tools 只为 batch 提供的那些功能**。

### 3.2 区别一：语义不同

| | 含义 | 典型例子 |
|---|---|---|
| `batch_key` | 你要跨越它去做整合的**那个技术单位** | 样本、测序批次、实验平台 |
| `categorical_covariate_keys` | 顺便扣除的**其他干扰因素** | 细胞周期、供体、性别、分箱后的 QC 指标 |

`phase` 是生物学上的干扰因素，不是技术批次，所以从语义上就该放进协变量。

### 3.3 区别二：batch_key 只能填一列，协变量可以填多列

那为什么不把 `sample` 和 `phase` 拼成一列 `sample_phase` 当作 batch？因为这样做有两个问题：

1. **类别数相乘**：比如 8 个样本 × 3 个周期 = 24 个类别，每个类别的细胞变少，模型学得更不稳定。
2. **丢掉了"可加"的结构**：
   - **分开放**时，模型学的是"sample 效应 + phase 效应"，G2M 期的效应在所有样本之间**共享**；
   - **拼在一起**后，"样本 A 的 G2M"和"样本 B 的 G2M"被当成毫不相关的两个类别，信息**无法共享**。

### 3.4 区别三：很多功能只认 batch

| 功能 | batch_key | categorical_covariate |
|---|:---:|:---:|
| `get_normalized_expression(transform_batch=...)`：把表达量"投影"到某个参考批次 | ✅ | ❌ |
| `dispersion="gene-batch"`：每个 batch 单独估计离散度 | ✅ | ❌ |
| `use_observed_lib_size=False` 时，按 batch 设定文库大小先验 | ✅ | ❌ |
| scArches / `load_query_data`：把新样本作为新 batch 映射到参考模型 | ✅（围绕 batch 设计） | 支持有限 |
| 差异表达时的 batch 校正、scIB 等整合评估指标 | 以 batch 为准 | — |

所以**样本这一维一般放在 `batch_key`**，才能用上这些功能。

### 3.5 怎么判断放哪边

| 情况 | 放在哪里 |
|---|---|
| 最主要要整合掉的那个技术因素（几乎总是样本或批次） | `batch_key` |
| 其他想一起扣除的分类因素（周期、供体、性别等） | `categorical_covariate_keys` |
| 连续值（未分箱的线粒体比例、基因数等） | `continuous_covariate_keys` |

> ⚠️ **注意**：放进协变量的因素，如果和你关心的生物学信号强相关（比如某个细胞类型本身就高度增殖），扣除它时也会把一部分真实的生物学差异一起抹掉。

---

## 4. 后续步骤

模型构建完成后，一般的流程是：

```python
# 训练模型
model.train()

# 取出潜在表示，代替 PCA
adata_integrated.obsm["X_scVI"] = model.get_latent_representation()

# 基于 scVI 潜在空间构建邻居图、降维、聚类
sc.pp.neighbors(adata_integrated, use_rep="X_scVI")
sc.tl.umap(adata_integrated)
sc.tl.leiden(adata_integrated)
```

关键在于用 `X_scVI` **代替 PCA**，作为构建邻居图、UMAP 和聚类的输入。
