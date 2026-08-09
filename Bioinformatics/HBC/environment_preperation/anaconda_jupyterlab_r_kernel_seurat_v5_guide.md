# Anaconda / JupyterLab 中创建 R Kernel 并安装 Seurat v5 测试指南

适用场景：

- 你已经在 Anaconda 环境里使用 JupyterLab
- 当前 JupyterLab 已经有 Python kernel
- 现在希望额外安装一个 R kernel
- 并在 R kernel 中安装和测试 Seurat v5

---

## 0. 推荐环境结构

不建议把 Python AI 环境和 R / Seurat 环境混在一起。

推荐单独创建一个 R 专用 conda 环境：

```text
r-seurat
```

这样可以减少依赖冲突，尤其是：

- numpy / scipy
- pytorch
- Rcpp
- BLAS / MKL
- Bioconductor packages
- Seurat dependencies

---

## 1. 打开 Anaconda Prompt

Windows 用户推荐使用：

```text
Anaconda Prompt
```

或者你也可以使用 PowerShell / Terminal，只要能执行 `conda` 命令即可。

先确认 conda 可用：

```bash
conda --version
```

如果能看到类似下面的输出，说明正常：

```text
conda 24.x.x
```

---

## 2. 创建 R + IRkernel 环境

推荐使用 `conda-forge`：

```bash
conda create -n r-seurat -c conda-forge r-base r-irkernel jupyterlab
```

解释：

| 包名           | 作用                              |
| ------------ | ------------------------------- |
| `r-base`     | 安装 R 语言本体                       |
| `r-irkernel` | 让 JupyterLab 支持 R kernel        |
| `jupyterlab` | 可选，但建议装，保证这个环境自己也能启动 JupyterLab |

创建过程中如果出现：

```text
Proceed ([y]/n)?
```

输入：

```bash
y
```

---

## 3. 激活 R 环境

```bash
conda activate r-seurat
```

激活成功后，命令行前面应该会显示：

```text
(r-seurat)
```

例如：

```text
(r-seurat) C:\Users\yourname>
```

---

## 4. 注册 R kernel 到 JupyterLab

进入 R：

```bash
R
```

在 R 交互界面中执行：

```r
IRkernel::installspec(
  name = "r-seurat",
  displayname = "R - Seurat"
)
```

解释：

| 参数 | 含义 |
|---|---|
| `name` | kernel 内部名称 |
| `displayname` | JupyterLab Launcher 里显示的名称 |

执行成功后退出 R：

```r
q()
```

如果提示是否保存 workspace，输入：

```text
n
```

---

## 5. 启动 JupyterLab

确保你还在 `r-seurat` 环境里：

```bash
conda activate r-seurat
```

启动 JupyterLab：

```bash
jupyter lab
```

打开浏览器后，在 Launcher 里应该可以看到：

```text
R - Seurat
```

点击它，新建一个 R notebook。

---

## 6. 测试 R kernel 是否正常

在 R notebook cell 里运行：

```r
x <- c(1, 2, 3, 4, 5)
mean(x)
```

正常输出应该是：

```text
3
```

再测试画图：

```r
plot(cars)
```

如果能显示图，说明 R kernel 基本正常。

---

## 7. 安装 Seurat v5

在 R notebook 中执行：

```r
install.packages("Seurat")
```

安装过程可能比较久。

如果提示选择 CRAN mirror，可以选一个离你比较近的，例如 Japan / Tokyo，或者直接使用默认。

安装完成后，测试加载：

```r
library(Seurat)
packageVersion("Seurat")
```

如果输出类似：

```text
[1] '5.x.x'
```

说明 Seurat v5 安装成功。

---

## 8. 创建一个最小 Seurat 对象测试

在 R notebook 里运行下面代码：

```r
library(Seurat)

# 创建一个模拟 count matrix
set.seed(123)

counts <- matrix(
  data = rpois(2000, lambda = 5),
  nrow = 100,
  ncol = 20
)

rownames(counts) <- paste0("Gene", 1:100)
colnames(counts) <- paste0("Cell", 1:20)

# 创建 Seurat object
seurat_obj <- CreateSeuratObject(counts = counts)

seurat_obj
```

如果正常，会看到类似：

```text
An object of class Seurat
100 features across 20 samples within 1 assay
Active assay: RNA
```

---

## 9. 测试 Seurat 基础分析流程

继续运行：

```r
seurat_obj <- NormalizeData(seurat_obj)

seurat_obj <- FindVariableFeatures(
  seurat_obj,
  selection.method = "vst",
  nfeatures = 50
)

seurat_obj <- ScaleData(seurat_obj)

seurat_obj <- RunPCA(
  seurat_obj,
  features = VariableFeatures(object = seurat_obj)
)

print(seurat_obj[["pca"]])
```

如果没有报错，并能看到 PCA 信息，说明 Seurat 基础流程可以正常运行。

---

## 10. 测试 UMAP / clustering

Seurat 的 UMAP 和 clustering 需要数据量稍微大一点。下面用模拟数据做一个简单测试。

```r
library(Seurat)

set.seed(123)

counts <- matrix(
  data = rpois(20000, lambda = 5),
  nrow = 500,
  ncol = 100
)

rownames(counts) <- paste0("Gene", 1:500)
colnames(counts) <- paste0("Cell", 1:100)

obj <- CreateSeuratObject(counts = counts)

obj <- NormalizeData(obj)
obj <- FindVariableFeatures(obj, nfeatures = 200)
obj <- ScaleData(obj)
obj <- RunPCA(obj, features = VariableFeatures(obj))

obj <- FindNeighbors(obj, dims = 1:10)
obj <- FindClusters(obj, resolution = 0.5)
obj <- RunUMAP(obj, dims = 1:10)

DimPlot(obj, reduction = "umap", group.by = "seurat_clusters")
```

如果能看到 UMAP 图，说明 Seurat v5 的主要功能已经可以使用。

---

## 11. 安装常用辅助包

后续做单细胞分析时，常用这些 R 包：

```r
install.packages(c(
  "dplyr",
  "ggplot2",
  "patchwork",
  "Matrix"
))
```

如果你要做 Seurat 和 Python / Scanpy 互通，可以再装：

```r
install.packages("remotes")
remotes::install_github("mojaveazure/seurat-disk")
```

然后测试：

```r
library(SeuratDisk)
```

---

## 12. Seurat 对象导出给 Python 使用

如果以后你想把 Seurat 分析结果交给 Python / Scanpy，可以使用 SeuratDisk。

R 中：

```r
library(SeuratDisk)

SaveH5Seurat(obj, filename = "sample.h5Seurat", overwrite = TRUE)
Convert("sample.h5Seurat", dest = "h5ad", overwrite = TRUE)
```

Python 中：

```python
import scanpy as sc

adata = sc.read_h5ad("sample.h5ad")
adata
```

推荐交接点：

```text
Seurat 完成 QC / normalization / integration / clustering / UMAP 后
↓
导出 h5ad
↓
Python / Scanpy / scvi-tools / visualization
```

---

## 13. 常见问题排查

### 问题 1：JupyterLab 里看不到 R kernel

先确认 kernel 是否注册成功：

```bash
jupyter kernelspec list
```

应该能看到类似：

```text
r-seurat
```

如果没有，重新进入 R 后执行：

```r
IRkernel::installspec(
  name = "r-seurat",
  displayname = "R - Seurat"
)
```

---

### 问题 2：`IRkernel::installspec()` 报错

先确认 IRkernel 是否安装：

```r
library(IRkernel)
```

如果失败，在 conda 环境里安装：

```bash
conda install -c conda-forge r-irkernel
```

然后重新注册 kernel。

---

### 问题 3：`install.packages("Seurat")` 很慢

可以尝试更换 CRAN mirror。

在 R 中：

```r
chooseCRANmirror()
```

选择 Japan 或者离你较近的镜像。

也可以直接指定：

```r
install.packages(
  "Seurat",
  repos = "https://cloud.r-project.org"
)
```

---

### 问题 4：Seurat 安装失败

优先尝试在 conda 环境里安装系统依赖：

```bash
conda install -c conda-forge r-devtools r-remotes r-rcpp r-matrix
```

然后回到 R 里：

```r
install.packages("Seurat")
```

---

### 问题 5：Windows 上编译 R 包失败

如果出现需要编译的错误，可能需要安装 Rtools。

Rtools 下载地址：

```text
https://cran.r-project.org/bin/windows/Rtools/
```

安装后重启 Anaconda Prompt，再尝试安装 Seurat。

---

## 14. 最终检查清单

确认以下项目都成功：

```r
library(Seurat)
packageVersion("Seurat")
```

```r
library(IRkernel)
```

```r
seurat_obj <- CreateSeuratObject(counts = counts)
```

```r
seurat_obj <- NormalizeData(seurat_obj)
seurat_obj <- FindVariableFeatures(seurat_obj)
seurat_obj <- ScaleData(seurat_obj)
seurat_obj <- RunPCA(seurat_obj)
```

如果这些都没有报错，说明：

```text
Anaconda + JupyterLab + R kernel + Seurat v5
```

已经可以正常使用。

---

## 15. 推荐工作流

建议你以后采用下面结构：

```text
R / Seurat notebook
    ↓
QC
normalization
integration
clustering
UMAP
    ↓
export h5ad
    ↓
Python / Scanpy notebook
    ↓
AI analysis
scVI
custom visualization
web app / browser viewer
```

这条路线比较适合：

- Python 主力开发者
- 想进入 AI bioinformatics
- 想做生信可视化工具
- 想结合前端 / WebGL / genome viewer 的开发者
