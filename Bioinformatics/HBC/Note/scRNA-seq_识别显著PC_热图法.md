---
title: scRNA-seq：用热图识别显著 PC
source: HBC (Harvard Chan Bioinformatics Core) scRNA-seq 教程
tags: [scRNA-seq, Seurat, PCA, 降维, 聚类]
---

# scRNA-seq：用热图识别显著 PC

> **原文**
> One way of exploring the PCs is using a heatmap to visualize the most variant genes for select PCs with the genes and cells ordered by PCA scores. The idea here is to look at the PCs and determine whether the genes driving them make sense for differentiating the different cell types.
> We are looking for a PC where the heatmap starts to look more "fuzzy", i.e. where the distinctions between the groups of genes is not so distinct.

## 1. 背景：为什么要挑 PC

PCA 之后，每个 PC 有两组数：

| 概念                  | 含义                 |
| ------------------- | ------------------ |
| **基因载荷 (loadings)** | 每个基因对该 PC 的贡献，有正有负 |
| **细胞得分 (scores)**   | 每个细胞在该 PC 上的坐标     |
|                     |                    |

后续的 KNN 图、聚类和 UMAP 都只用**前 N 个 PC**：

- N 太小：丢掉区分稀有细胞类型的信号
- N 太大：把噪声带进聚类

所以要判断**从哪个 PC 开始只剩噪声**。

## 2. 热图法怎么做

对选定的几个 PC 各画一张热图（Seurat `DimHeatmap`）：

- **行**：该 PC 上载荷最极端的基因，一半取正向最大的，一半取负向最大的
- **列**：该 PC 得分最极端的细胞，两头各取一批（如 `cells = 500`）
- 行和列都按 PCA 得分/载荷排序

```r
DimHeatmap(seurat_obj, dims = 1:9, cells = 500, balanced = TRUE)
```

## 3. 怎么看热图

### ✅ 有意义的 PC
- 有清楚的**块状结构**：一组基因在左侧细胞高表达、在右侧低表达，另一组正好相反
- 说明这个 PC 抓到的是**真实的生物学差异**，通常对应两类细胞之间的区别

### ❌ 开始失去意义的 PC
- 热图变得 **"fuzzy"（模糊、斑驳）**
- 基因块之间的高低分界不再清楚，颜色像随机噪点
- 说明这个 PC 主要在解释随机变异或技术噪声

> [!tip] 截断点
> 热图**开始变模糊的地方**，大致就是该截断的 PC 数。

## 4. 检查驱动基因是否 "make sense"

把每个 PC 的驱动基因拿出来，看是不是已知的细胞类型 marker：

```r
print(seurat_obj[["pca"]], dims = 1:10, nfeatures = 5)
```

**示例（PBMC）**：PC1 的一端是 *CD3D*、*IL7R*（T 细胞），另一端是 *LYZ*、*S100A8*（单核细胞），生物学含义明确。

> [!warning] 可疑信号
> 如果某个 PC 主要由以下基因驱动，它反映的可能是细胞状态或技术因素，不是细胞类型：
> - 线粒体基因 (*MT-*)
> - 核糖体基因 (*RPS*/*RPL*)
> - 细胞周期基因

## 5. 注意事项

1. **方法比较主观**：何时"变模糊"没有硬标准，需要配合其他方法：
   - **Elbow plot**：看每个 PC 解释的方差何时趋于平缓
   - **JackStraw**：老版本流程中常用的置换检验
2. **热图只取两头最极端的细胞**：它反映的是该 PC 能不能把两端的细胞分开，不代表所有细胞
3. **SCTransform 流程**：下游结果对 PC 数量不太敏感，教程建议**宁多勿少**（如 30–40 个）。多取的 PC 噪声影响有限，少取却可能丢掉稀有细胞群的信号

## 6. 一句话总结

用热图逐个检查 PC：**块状结构清楚、驱动基因是合理 marker 的保留；热图开始糊掉的地方，就是截断位置。**
