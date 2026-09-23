
这类 notebook 看起来像是在同一个 Jupyter Notebook 里混用 Python 和 R，但本质上通常不是同时开了两个 kernel。

更准确地说，它使用的是：

> Python kernel 作为主 kernel，然后通过 `rpy2` 把 R 嵌入到 Python notebook 中执行。

## 核心工具：rpy2

`rpy2` 是一个 Python 和 R 之间的桥接工具。它可以让 Python 调用 R，也可以让 Jupyter Notebook 通过 magic command 执行 R 代码。

在 sc-best-practices 的 normalization 章节中，环境里同时安装了 Python、R 和 `rpy2`：

```yaml
python=3.12.9
r-base=4.3.3
rpy2=3.5.11
bioconductor-scran
bioconductor-scry
bioconductor-glmgampoi
```

也就是说，这个 conda 环境既能跑 Python 包，比如 `scanpy`，也能跑 R/Bioconductor 包，比如 `scran`。

## 第一步：加载 Rpy2 的 IPython 扩展

在 Python cell 里执行：

```python
%load_ext rpy2.ipython
```

这句会启用两个常用的 magic：

| magic | 作用 |
|---|---|
| `%R` | 在一行里执行 R 代码 |
| `%%R` | 把整个 cell 当作 R 代码执行 |

注意：

- `%R` 是 line magic，只作用于当前这一行。
- `%%R` 是 cell magic，必须放在 cell 的第一行，会让整个 cell 都用 R 执行。

## 第二步：在 Notebook 里写 R Cell

加载扩展后，就可以这样写 R 代码：

```r
%%R
library(scran)
library(BiocParallel)
```

这个 cell 虽然在 Python kernel 的 notebook 里，但因为第一行是 `%%R`，所以 cell 内容会交给 R 执行。

## Python 数据传给 R

如果 Python 里有一个变量，想传给 R，可以使用 `ro.globalenv`。

例如，把 Python 的 NumPy array 传给 R：

```python
import numpy as np
import rpy2.robjects as ro
from rpy2.robjects import numpy2ri
from rpy2.robjects.conversion import localconverter

x = np.array([1, 2, 3, 4, 5])

with localconverter(ro.default_converter + numpy2ri.converter):
    ro.globalenv["x"] = x
```

这段代码的意思是：

- Python 里有一个变量 `x`
- 把它转换成 R 能理解的对象
- 放进 R 的全局环境
- 在 R 里也可以用变量名 `x` 访问

然后在 R cell 里可以直接用：

```r
%%R
print(x)
mean(x)
```

## R 结果传回 Python

如果 R 里算出了一个结果，想传回 Python，可以用 `%%R -o`。

例如：

```r
%%R -o y
y <- mean(x)
```

这里的 `-o y` 表示：

> 把 R 里的变量 `y` 输出回 Python 环境。

之后在 Python cell 里可以直接使用：

```python
print(y)
```

## 在 Sc-best-practices 文章里的实际用法

那篇文章中，主要流程是：

```text
Python / Scanpy 做预处理
        ↓
把 count matrix 和 cell groups 传给 R
        ↓
R / scran 计算 size factors
        ↓
把 R 结果传回 Python
        ↓
继续用 Python / AnnData / Scanpy 分析
```

文章里先在 Python 中准备数据：

```python
data_mat = adata.layers["counts"].T
input_groups = adata_pp.obs["groups"]
```

然后传给 R：

```python
with localconverter(ro.default_converter + numpy2ri.converter):
    ro.globalenv["data_mat"] = data_mat

with localconverter(ro.default_converter + pandas2ri.converter):
    ro.globalenv["input_groups"] = adata_pp.obs["groups"]
```

接着用 R 的 `scran` 包计算 size factors：

```r
%%R -o size_factors

size_factors = sizeFactors(
    computeSumFactors(
        SingleCellExperiment(
            list(counts=data_mat)),
            clusters = input_groups,
            min.mean = 0.1,
            BPPARAM = MulticoreParam()
    )
)
```

最后回到 Python 继续使用：

```python
adata.obs["size_factors"] = size_factors
```

## 最小可运行示例

下面是一个最小例子，可以用来理解 Python 和 R 如何互相传变量。

### Python Cell

```python
%load_ext rpy2.ipython

import numpy as np
import rpy2.robjects as ro
from rpy2.robjects import numpy2ri
from rpy2.robjects.conversion import localconverter

x = np.array([1, 2, 3, 4, 5])

with localconverter(ro.default_converter + numpy2ri.converter):
    ro.globalenv["x"] = x
```

### R Cell

```r
%%R -o y
y <- mean(x)
```

### Python Cell

```python
print(y)
```

输出应该是：

```text
[3.]
```

## 常见问题

### 1. 为什么不是直接用 R kernel？

因为这个 notebook 的主体生态是 Python，例如：

- `scanpy`
- `anndata`
- `numpy`
- `pandas`
- `matplotlib`
- `seaborn`

但某些成熟的单细胞方法在 R/Bioconductor 里更常用，比如：

- `scran`
- `sctransform`
- `glmGamPoi`

所以用 Python kernel 加 `rpy2` 可以同时利用 Python 和 R 的生态。

### 2. `%R` 和 `%%R` 有什么区别？

| 写法 | 含义 |
|---|---|
| `%R mean(x)` | 只执行这一行 R 代码 |
| `%%R` | 整个 cell 都是 R 代码 |

### 3. `-o` 是什么意思？

`-o` 是 output 的意思，用来把 R 变量传回 Python。

例如：

```r
%%R -o result
result <- 1 + 2
```

之后 Python 里就能用：

```python
print(result)
```

### 4. Python 变量怎么传给 R？

常见方式有两种：

第一种是用 `ro.globalenv`：

```python
ro.globalenv["x"] = x
```

第二种是用 `%%R -i`：

```r
%%R -i x -o y
y <- mean(x)
```

其中：

- `-i x`：把 Python 变量 `x` 输入到 R
- `-o y`：把 R 变量 `y` 输出回 Python

## 一句话总结

在 Jupyter Notebook 里混用 Python 和 R，常见做法是：

> 使用 Python kernel，安装并加载 `rpy2`，然后用 `%R` / `%%R` 执行 R 代码，用 `-i`、`-o` 或 `ro.globalenv` 在 Python 和 R 之间传变量。

## 参考链接

- sc-best-practices normalization 章节：<https://www.sc-best-practices.org/preprocessing_visualization/normalization.html>
- IPython extensions 文档：<https://ipython.readthedocs.io/en/stable/config/extensions/index.html>
- rpy2 文档：<https://rpy2.github.io/>
