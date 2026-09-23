## Scanpy Highly Variable Genes（HVG）笔记

### 1. 为什么不能直接按方差选基因

单细胞数据里，**基因表达量越高，方差天然越大**（泊松噪声决定的）。如果直接按方差排序，选出来的全是高表达管家基因，而不是真正"在细胞间有生物学差异"的基因。

所以核心思路是：**先扣掉"均值-方差"这层技术趋势，再看谁的残余变异还特别大**。

Scanpy 提供三种算法（`sc.pp.highly_variable_genes(…, flavor=…)`），做法从粗糙到精细依次是：`seurat`（默认）→ `seurat_v3` → `pearson_residuals`（experimental）。

---

### 2. 三种/四种算法总览

| flavor | 输入数据 | 均值-方差关系建模方式 |
|--------|---------|----------------------|
| `seurat`（默认） | log1p 后的数据 | 分 bin + 组内 z-score |
| `cell_ranger` | log1p 后的数据 | 分 bin + 组内 z-score（参数细节不同） |
| `seurat_v3` | **原始 counts** | loess 曲线拟合 + 标准化残差 |
| `pearson_residuals`（experimental） | **原始 counts** | 显式负二项模型 + Pearson 残差 |

---

### 3. 默认方法 `flavor='seurat'` 详细步骤

#### 第 1 层：粗略去趋势

```
dispersion = var / mean
```

除以均值先抹掉方差随均值线性增长的部分（类似统计学里的 Fano factor）。

#### 取 log（关键一步，见第 6 节）

```python
dispersion = np.log(dispersion)
mean = np.log1p(mean)
```

#### 分 Bin + 组内 Z-score

1. 按 `mean`（log 后）把所有基因切成约 20 个 bin
2. 同一个 bin 内的基因，理论上方差该差不多（依据见第 4 节）
3. 对 bin 内的 `dispersion` 做 z-score：

```
normalized_dispersion = (dispersion − μ_bin) / σ_bin
```

其中 `μ_bin`、`σ_bin` 是这个 bin 内所有基因 dispersion 的均值和标准差。

#### 数值例子

假设一个 bin 里 5 个基因，均值都差不多：

| 基因 | mean | var | dispersion = var/mean |
|------|------|-----|------------------------|
| A | 2.0 | 2.0 | 1.00 |
| B | 2.1 | 2.2 | 1.05 |
| C | 1.9 | 8.0 | **4.21** ← 明显偏高 |
| D | 2.0 | 1.8 | 0.90 |
| E | 2.05 | 2.05 | 1.00 |

```
μ_bin ≈ 1.63,  σ_bin ≈ 1.29
```

z-score：A≈−0.49，B≈−0.45，**C≈+2.00**，D≈−0.57，E≈−0.49

→ 基因 C 尽管均值和其它基因差不多，但方差异常大，z-score 高，被标记为 highly variable。

结果存进 `adata.var["dispersions_norm"]`，按 `n_top_genes` 或 `min_disp` 阈值取 top 作为 HVG。

---

### 4. 关键假设的辩护

#### 假设 1："同一表达水平的基因，方差该差不多"——依据是什么？

**不是**"生物学上相似均值的基因都长得差不多"，而是基于**测序计数数据的噪声模型**：

- scRNA-seq 本质是抽样/计数过程。若一个基因没有真正的生物学差异（真实表达率恒定，细胞间波动纯粹来自技术噪声），则在：
  - **泊松模型**下：`方差 = 均值`
  - **负二项模型**下：`方差 = 均值 + α·均值²`
- 两种情况下方差都是均值的**确定性函数** → 这给出一个"纯噪声情况下方差应该多大"的参照系（null model）。
- 方差明显超出这个参照的部分，就不能用抽样噪声解释，只能归因于**真实生物学异质性**——这正是要找的 HVG。

**已知局限**：
1. bin 内均值本身有跨度，残留趋势没扣干净
2. 不同基因的技术噪声水平可能不同（GC 含量、转录本长度、比对歧义等会影响捕获效率）

这正是 `seurat_v3`（连续 loess 曲线）和 `pearson_residuals`（显式 NB 模型）要改进的地方。

#### 假设 2：这是 Z-score 还是 t-score？

**结论：是 z-score，不是 t-score。**

```
z-score（标准化单个观测值）：  (x − μ) / σ
t-score（检验一个"均值估计"）：(x̄ − μ₀) / (s / √n)
```

- t-score 除以标准误 `s/√n`，是因为它标准化的对象是**"由 n 个样本估计出的均值"**，要把这份不确定性算进去。
- Scanpy 这里标准化的是**单个基因的观测值**（bin 里众多基因中的一个），没有任何地方除以 `√n`，结构上完全对应 z-score 定义。
- `μ_bin`、`σ_bin` 是从有限样本估计出来的，这个事实**不会**把公式变成 t-score——t/z 的分界线在于"标准化对象是不是均值估计量、要不要 ÷√n 修正抽样不确定性"，而不在于"参数是真是估的"。

---

### 5. Z-score 在非正态分布下还有意义吗？

Dispersion（`var/mean`）确实**不是正态分布**——非负、右偏（少数基因方差极端大，拖出长尾）。

#### 两件事要分开看

- **(a) "z=2 对应正态分布前 2.3%"这种概率论断** → 确实需要正态假设，分布一偏就不成立。
- **(b) Scanpy 实际只是拿 z-score 当排名/筛选分数**，从未做过这种概率论断。作为排名工具，只需要 `σ_bin` 能合理反映"这个 bin 有多分散"，不需要正态。

#### 更关键：z-score 在 Bin 内部根本不改变排序

`(x−μ)/σ` 是仿射变换（减常数、除正常数），bin 内所有基因共享同一个 `μ_bin`、`σ_bin`，所以变换前后**排序完全不变**。

z-score 真正的作用是让**不同 bin 之间可比**——低表达 bin 天生波动小，高表达 bin 天生波动大，不做这层缩放会导致排名被高表达基因系统性霸占。这个"跨 bin 可比"的功能**不需要正态**，只需要标准差能衡量离散程度。

#### 但偏度问题是真实的工程隐患

右偏分布下均值和标准差**不稳健**，少数极端基因会把 `σ_bin` 拉大，压缩其它基因的 z-score，让方法变迟钝。

Scanpy 的应对：**分箱和标准化之前先对 dispersion 取 log**（见第 3 节），专门用来压缩长尾、减轻偏度——这是有意为之的工程选择，但取 log 后依然不是严格正态，scanpy 也从未拿它算 p 值，自始至终只是启发式排名分数。

---

### 6. 为什么取 Log 能压缩右侧长尾

**核心机制**：`log(x)` 的导数是 `1/x`，x 越大导数越小 → 大数区域被压扁，小数区域几乎不受影响。本质上，**log 把"倍数关系"变成了"加减关系"**。

#### 数值演示

取典型右偏数据 `1, 10, 100, 1000`（每个是前一个的 10 倍）：

**原始尺度**：相邻差距 `9, 90, 900`，差距暴涨；均值 `277.75`（被 1000 拽走，不代表典型值）；标准差平方和里 `1000` 这一项占 90% 以上，`σ` 几乎完全由它决定。

**取 log10 后**：`0, 1, 2, 3`，相邻差距全部是 `1`，完全均匀；均值 `1.5`，正好在中间；标准差不再被单点主导，两端贡献对称均衡。

#### 为什么这对 Dispersion 恰好管用

一个 bin 里，大多数基因的 dispersion 挤在 `~1` 附近，少数候选 HVG 是 `5、10、50` 这种**倍数级**偏离——和 `1,10,100,1000` 是同一类结构。不取 log，这几个基因会自己把 `σ_bin` 撑大，导致自己的 z-score 反而被压低、其它基因全部挤到 0 附近；取 log 后，这些倍数差距被压成加法差距，`σ_bin` 不再被绑架，真正的高变基因才能干净地凸显出来。

---

### 7. `flavor='seurat_v3'` 详解

针对"分箱是硬切、不连续"和"σ_bin 被极端值绑架"两个短板，换用**连续曲线**代替离散分箱，且**标准化对象是原始计数本身，不是汇总统计量**。输入必须是**原始 counts**（不能先 log）。

**步骤**：

1. 算每个基因的均值和方差（原始 counts，不取 log）
2. **拟合 loess 曲线**：横轴 `log10(mean)`，纵轴 `log10(variance)`，对全体基因做局部加权回归——一条平滑连续曲线，代替离散 bin 均值
3. 用曲线预测值**标准化每个基因在每个细胞的原始计数**：
   ```
   z_{g,c} = (x_{g,c} − mean_g) / sqrt(预测方差_g)
   ```
4. **截断极端值**：限制在 `±√N`（N=细胞数），防止个别细胞（如双联体）单方面撑爆某基因的分数
5. 对每个基因，算标准化后的值在所有细胞上的**方差**——这是最终 HVG 分数。远超基线的即为高变基因

```python
sc.pp.highly_variable_genes(adata, flavor="seurat_v3", n_top_genes=2000, layer="counts")
```

---

### 8. Pearson Residuals 详解

（Lause, Berens & Kobak, 2021）不用经验曲线拟合，而是**显式假设一个生成模型**，数学推导该有多大方差。输入同样需要**原始 counts**。

**步骤**：

1. **定义零假设模型**：基因 g 在细胞 i 的计数服从负二项分布：
   ```
   x_{g,i} ~ NB(μ_{g,i}, θ_g)
   μ_{g,i} = n_i · p_g
   ```
   - `n_i`：细胞 i 的总 counts（测序深度）
   - `p_g`：基因 g 占全体转录本的平均比例
   - `θ_g`：NB 离散参数

   含义：若基因没有生物学差异，细胞间计数差异应纯粹来自测序深度不同 + 固定表达比例。

2. **计算 Pearson residual**（GLM 诊断的标准量）。NB 方差公式 `Var(x) = μ + μ²/θ`：
   ```
   z_{g,i} = (x_{g,i} − μ_{g,i}) / sqrt(μ_{g,i} + μ_{g,i}²/θ_g)
   ```
   若模型设定正确，残差理论上均值 0、方差 1（Pearson residual 的标准性质）。

3. 同样做**极端值截断**

4. 对每个基因，算其 Pearson residual 在所有细胞上的**方差**：
   - ≈1：该基因只是"深度+固定比例"驱动，符合零假设
   - 远大于 1：观测波动无法用深度差异解释 → 真正的生物学高变异信号

   按残差方差排序，取 top N 为 HVG。

```python
sc.experimental.pp.highly_variable_genes(adata, flavor="pearson_residuals", n_top_genes=2000)
```

**额外用途**：Pearson residual 本身也可直接作为**归一化后的表达矩阵**，替代传统的 `normalize_total + log1p`，因为它源自显式统计模型，理论依据比"任意取 log"更扎实。

---

### 9. 三种方法横向对比

| | seurat（默认） | seurat_v3 | Pearson residuals |
|---|---|---|---|
| 输入 | log1p 后的数据 | 原始 counts | 原始 counts |
| 均值-方差关系建模 | 离散分箱 + 组内 z-score | loess 连续曲线拟合 | 显式负二项模型（含参数 θ） |
| 标准化对象 | 汇总统计量（dispersion） | 每个基因-细胞的原始值 | 每个基因-细胞的原始值 |
| 显式生成模型 | 无，纯经验 | 无，曲线是经验拟合的 | **有**，NB 模型 + 数学推导 |
| 极端值处理 | 无（这是它脆弱的原因） | 截断在 `±√N` | 截断在 `±√N` |
| 统计严谨程度 | 最弱（启发式） | 中等 | 最强 |

**演化脉络**：`seurat`（分箱经验法）→ `seurat_v3`（连续曲线替代硬分箱，逐细胞利用信息）→ `Pearson residuals`（彻底换成可写清楚的概率模型）。每一步都在回应：分箱粗糙、极端值不稳健、z-score 缺乏概率意义这几个问题。

---

### 10. SCTransform：与 Pearson Residuals 同源的方法

SCTransform（Hafemeister & Satija, 2019）是 Seurat 里的方法，**Pearson residuals 的思路正是照着它的统计框架来的**——理解了第 8 节的 Pearson residuals，SCTransform 的三个卖点就很容易讲清楚。

原文描述：

> SCTransform 不仅归一化数据（替代 log 变换），还做方差稳定化（variance stabilization），还允许额外协变量（additional covariates）的回归。

#### (1) Regress out effects（回归掉某种效应）

拟合模型 `基因表达 ~ f(协变量)`，**残差 = 实际观测值 − 模型预测值**。残差代表"扣掉协变量能解释的部分之后，还剩下的变异"。

单细胞里典型的"不想要的效应"：
- **测序深度**：细胞测得深，几乎所有基因读数都跟着水涨船高，这是技术差异不是生物学差异
- **细胞周期**：S/G2M 期会系统性影响一批基因表达
- **线粒体比例、批次(batch)、样本来源**

不处理的话，聚类可能按测序深度或细胞周期分组，而不是按真正关心的生物学状态分组。"regress out"就是把这些已知效应先从表达值里扣掉。

#### (2) Variance stabilization（方差稳定化）

回忆第 1 节：原始计数数据里**表达量越高、方差天然越大**（异方差性 heteroskedasticity）。这会导致 PCA/聚类时，**高表达基因仅因为噪声绝对值大就主导主成分**，噪声被误认成信号。

Variance stabilization 就是把数据变换成"方差不再依赖均值"——不管基因表达量高低，变换后噪声尺度都差不多。这正是第 8 节 Pearson residual 公式里"除以模型预期标准差"那一步在做的事：

```
z_{g,i} = (x_{g,i} − μ_{g,i}) / sqrt(μ_{g,i} + μ_{g,i}²/θ_g)
```

若基因只是技术噪声驱动，残差方差应该都 ≈1，不再随表达量系统性变化。**传统 log1p 变换只是一个固定的、和数据无关的函数**，并非专门为方差恒定设计的，变换后仍残留均值-方差关系——这就是"SCTransform 是 log 变换更好替代"的原因。

#### (3) Additional covariates（额外协变量）

Regress out 的模型不必只回归测序深度，SCTransform 的框架是：

```
基因表达 ~ 测序深度 + 你指定的其它协变量
```

常见的额外协变量：
- **细胞周期分数**（`S.Score`、`G2M.Score`）——不想让聚类被细胞周期主导
- **线粒体比例**（`pct_counts_mt`）——扣掉残留低质量细胞的信号
- **批次/样本来源**——多样本合并分析时先扣掉批次间系统差异

```r
# Seurat
SCTransform(seurat_obj, vars.to.regress = c("percent.mt", "S.Score", "G2M.Score"))
```

`vars.to.regress` 传入的列表就是"additional covariates"。

#### 三件事是一次建模完成的

拟合"表达量 ~ 深度 + 其它协变量"的**负二项回归**，取 **Pearson residual** 作为输出——残差同时具备归一化、方差稳定、协变量校正三种效果，这也是它比"先 log 归一化、再单独 regress out"这种分步流程更被看好的原因。

---

### 11. 代码速查

```python
# 默认方法（需先 normalize_total + log1p）
sc.pp.highly_variable_genes(adata, min_mean=0.0125, max_mean=3, min_disp=0.5)

# 或直接取 top N
sc.pp.highly_variable_genes(adata, n_top_genes=2000)

# seurat_v3（需原始 counts）
sc.pp.highly_variable_genes(adata, flavor="seurat_v3", n_top_genes=2000, layer="counts")

# Pearson residuals（需原始 counts，experimental）
sc.experimental.pp.highly_variable_genes(adata, flavor="pearson_residuals", n_top_genes=2000)

# 结果存于 adata.var["highly_variable"]，后续常用：
adata = adata[:, adata.var.highly_variable].copy()
```

```r
# SCTransform（Seurat）
seurat_obj <- SCTransform(seurat_obj, vars.to.regress = c("percent.mt", "S.Score", "G2M.Score"))
```
