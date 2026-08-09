---
created: 2026-06-16
aliases:
  - Jupyter Notebook 中 R kernel 和 Python kernel 能否混用
source: "[[Bioinformatics/HBC/environment_preperation/anaconda_jupyterlab_r_kernel_seurat_v5_guide.md|Anaconda / JupyterLab R kernel Seurat v5 guide]]"
tags:
  - bioinformatics
  - jupyter
  - r
  - python
  - seurat
  - scanpy
---

# Jupyter Notebook 中 R kernel 和 Python kernel 能否混用

## 一句话结论

**JupyterLab 可以同时使用 R kernel 和 Python kernel，但一个普通 `.ipynb` notebook 默认只能绑定一个 active kernel。**

也就是说：

- 在同一个 JupyterLab 工作区里，可以同时打开一个 Python notebook 和一个 R / Seurat notebook。
- 在同一个 `.ipynb` 文件里，默认不是“这个 cell 用 R、那个 cell 用 Python”的模式。
- 如果确实想在一个 notebook 里混用，需要借助额外桥接工具，例如 `rpy2` 或 `reticulate`。
- 对 Seurat / Scanpy 这类生信流程，更推荐分 notebook，用 `.h5ad`、`.h5Seurat`、`.rds` 或 `.csv` 交换数据。

---

## 1. 同一个 JupyterLab 里可以混用

JupyterLab 本身可以同时管理多个 notebook 和多个 kernel。例如：

```text
JupyterLab
├─ notebook_A.ipynb  -> Python kernel
└─ notebook_B.ipynb  -> R - Seurat kernel
```

这完全没问题。你可以在一个浏览器窗口里同时做：

- Python / Scanpy / PyTorch / scVI 分析
- R / Seurat / ggplot2 / Bioconductor 分析

每个 notebook 使用自己的 kernel，互不干扰。

---

## 2. 同一个 `.ipynb` notebook 默认不能直接混两个 kernel

一个普通 Jupyter Notebook 默认只有一个 **active kernel**。

例如：

- notebook 选择了 Python kernel，cell 默认都按 Python 执行。
- notebook 选择了 R kernel，cell 默认都按 R 执行。
- 可以手动切换 kernel，但切换后变量、内存状态、已加载包不会自动继承。

所以，默认情况下不是每个 cell 都可以天然选择不同语言。

---

## 3. 如果想在 Python notebook 里调用 R

可以使用 `rpy2`。

在 Python kernel 中：

```python
%load_ext rpy2.ipython
```

然后用 `%%R` magic 执行 R 代码：

```python
%%R
x <- c(1, 2, 3)
mean(x)
```

适合场景：

- 主流程在 Python。
- 偶尔需要调用 R 的统计函数或画图包。
- 想在 Python notebook 里嵌入少量 R 代码。

注意：

- 在 Windows + conda + R 环境下，`rpy2` 有时安装和路径配置会比较麻烦。
- 如果还涉及 Seurat、Bioconductor、Scanpy、PyTorch 等复杂依赖，不建议把所有东西强行塞进一个环境。

---

## 4. 如果想在 R notebook 里调用 Python

可以使用 R 包 `reticulate`。

在 R kernel 中：

```r
install.packages("reticulate")
library(reticulate)
```

然后运行 Python 代码：

```r
py_run_string("import numpy as np")
py_run_string("print(np.mean([1, 2, 3]))")
```

适合场景：

- 主流程在 R / Seurat。
- 偶尔需要调用 Python 的小工具。
- 想在 R notebook 里使用部分 Python 包。

如果主要做 Seurat，这个方向相对自然：**主 notebook 用 R kernel，必要时用 `reticulate` 调 Python。**

---

## 5. 对 Seurat / Scanpy 更推荐的工作流

对单细胞分析来说，更稳妥的做法是：

```text
R / Seurat notebook
  -> QC
  -> normalization
  -> integration
  -> clustering
  -> UMAP
  -> 导出 h5Seurat / h5ad

Python / Scanpy notebook
  -> 读取 h5ad
  -> Scanpy / scVI-tools / AI analysis
  -> visualization / downstream modeling
```

这样做的优点：

- R 和 Python 环境可以分开维护，减少依赖冲突。
- Seurat 和 Scanpy 各自使用最适合自己的生态。
- notebook 更清晰，方便复现和排错。
- 中间结果可以保存成文件，方便之后继续分析。

---

## 6. Seurat 导出给 Python 使用的例子

在 R / Seurat notebook 中：

```r
library(SeuratDisk)

SaveH5Seurat(obj, filename = "sample.h5Seurat", overwrite = TRUE)
Convert("sample.h5Seurat", dest = "h5ad", overwrite = TRUE)
```

在 Python / Scanpy notebook 中：

```python
import scanpy as sc

adata = sc.read_h5ad("sample.h5ad")
adata
```

这样就可以把 Seurat 对象转换成 Python / Scanpy 常用的 AnnData 格式。

---

## 7. 实际建议

如果是当前的 Seurat v5 / JupyterLab / Anaconda 场景，建议采用：

```text
Seurat 主流程：R kernel
Scanpy / scVI / AI 分析：Python kernel
数据交换：h5Seurat / h5ad / rds / csv
```

不要强行把 R / Seurat 和 Python / PyTorch / Scanpy 全部塞进一个 notebook 或一个 conda 环境里。短期看起来方便，长期容易出现依赖冲突、kernel 找不到包、版本不兼容等问题。

## 最终结论

**可以在 JupyterLab 中同时使用 R kernel 和 Python kernel；但同一个普通 notebook 默认只能绑定一个 kernel。**

真正稳定的做法是：

- 一个 R notebook 做 Seurat。
- 一个 Python notebook 做 Scanpy / AI 分析。
- 中间用标准数据格式交换。
