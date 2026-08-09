---
created: 2026-08-10
tags:
  - jupyterlab
  - r
  - irkernel
  - conda
  - troubleshooting
related:
  - "[[anaconda基本命令]]"
  - "[[anaconda_jupyterlab_r_kernel_seurat_v5_guide]]"
  - "[[Untitled2.ipynb]]"
---

# JupyterLab R kernel 无法运行的修复记录

## 结论

这次 R kernel 不能正常运行，主要不是 R 或 IRkernel 没装好，而是 **Jupyter kernelspec 的启动命令没有激活 `r-lab` conda 环境**。

原来的 R kernel 是从 base 环境的 JupyterLab 里直接启动 `r-lab` 里的 `R.exe`。在 Windows/conda 环境下，这样会缺少 `PATH`、`CONDA_PREFIX` 等环境变量，导致 R 进程启动时找不到依赖 DLL，kernel 会直接死亡。

最终修复方式：把 `r-lab` 的 kernelspec 改成通过 `conda run -n r-lab ...` 启动 R kernel。

---

## 当时的问题表现

在 JupyterLab 里选择 `R (r-lab)` 后，R kernel 不能正常执行代码，表现为 kernel 无响应、启动失败或启动后很快死亡。

当前相关 notebook：

- `[[Untitled.ipynb]]`
- `[[Untitled1.ipynb]]`
- `[[Untitled2.ipynb]]`

---

## 检查到的环境状态

先确认 Jupyter 能看到 R kernel：

```powershell
jupyter kernelspec list --json
```

检查到的 kernelspec 位置是：

```text
C:\Users\user\AppData\Roaming\jupyter\kernels\r-lab\kernel.json
```

确认 conda 里确实有 `r-lab` 环境：

```powershell
conda env list
```

结果里有：

```text
base   C:\Users\user\anaconda3
r-lab  C:\Users\user\anaconda3\envs\r-lab
```

确认 `r-lab` 环境里的 R 和 IRkernel 本身是正常的：

```powershell
conda run --no-capture-output -n r-lab Rscript -e "cat(as.character(getRversion()), '\n'); cat(as.character(packageVersion('IRkernel')), '\n')"
```

结果：

```text
4.5.3
1.3.2
```

说明：

- R 已安装，版本是 `4.5.3`
- IRkernel 已安装，版本是 `1.3.2`
- 问题不在 R 包缺失，而在 kernel 启动方式

---

## 根因

原始 `kernel.json` 大概是这样直接调用 R：

```json
{
  "argv": [
    "C:/Users/user/anaconda3/envs/r-lab/lib/R/bin/x64/R",
    "--slave",
    "-e",
    "IRkernel::main()",
    "--args",
    "{connection_file}"
  ],
  "display_name": "R (r-lab)",
  "language": "R"
}
```

这个配置有两个问题：

1. 路径写成了没有 `.exe` 的 `R`
   - `C:\Users\user\anaconda3\envs\r-lab\lib\R\bin\x64\R` 不存在
   - `C:\Users\user\anaconda3\envs\r-lab\lib\R\bin\x64\R.exe` 才存在

2. 即使改成 `R.exe`，直接从 base Jupyter 启动也仍然不稳
   - 因为没有真正激活 `r-lab`
   - Windows 下 conda 环境里的 R 依赖很多 DLL
   - 不激活环境时，`PATH` 里没有对应 DLL 目录
   - 直接启动会出现类似 `0xC0000135` / `3221225781` 的进程退出码

所以真正的问题是：**base JupyterLab 调 r-lab 的 R kernel 时，没有先进入 r-lab 的运行环境。**

---

## 修复方式

先备份原来的 kernelspec：

```text
C:\Users\user\AppData\Roaming\jupyter\kernels\r-lab\kernel.json.bak-before-conda-run-20260809
```

然后把：

```text
C:\Users\user\AppData\Roaming\jupyter\kernels\r-lab\kernel.json
```

改成：

```json
{
  "argv": [
    "C:\\Users\\user\\anaconda3\\Scripts\\conda.exe",
    "run",
    "--no-capture-output",
    "-n",
    "r-lab",
    "R",
    "--slave",
    "-e",
    "IRkernel::main()",
    "--args",
    "{connection_file}"
  ],
  "display_name": "R (r-lab)",
  "language": "R"
}
```

关键点是这一段：

```text
conda.exe run --no-capture-output -n r-lab R
```

它的作用是：

- 让 Jupyter 从 base 环境启动也没关系
- 每次启动 R kernel 时，自动在 `r-lab` 环境中执行 R
- 自动补齐 conda 环境变量和 DLL 搜索路径

---

## 修复后的验证

检查当前 kernelspec：

```powershell
jupyter kernelspec list --json
```

应该看到 `r-lab` 的 `argv` 已经变成：

```text
C:\Users\user\anaconda3\Scripts\conda.exe run --no-capture-output -n r-lab R --slave -e IRkernel::main() --args {connection_file}
```

再验证 R 和 IRkernel：

```powershell
conda run --no-capture-output -n r-lab Rscript -e "cat(as.character(getRversion()), '\n'); cat(as.character(packageVersion('IRkernel')), '\n')"
```

当前结果：

```text
R: 4.5.3
IRkernel: 1.3.2
```

检查 Jupyter server：

```powershell
jupyter server list
```

当前服务运行在：

```text
http://localhost:8888/?token=silicon-jupyter-mcp-2026
```

Jupyter API 里也能看到多个 notebook 已经使用 `r-lab` kernel，并且状态是 `idle`，例如：

- `Bioinformatics/HBC/environment_preperation/Untitled.ipynb`
- `Bioinformatics/HBC/environment_preperation/Untitled1.ipynb`
- `Bioinformatics/HBC/environment_preperation/Untitled2.ipynb`

---

## 如果以后又坏了，优先检查这些

### 1. 查看 R kernel 配置

```powershell
Get-Content -Raw "$env:APPDATA\jupyter\kernels\r-lab\kernel.json"
```

重点确认里面是 `conda.exe run -n r-lab R`，而不是直接调用某个 `R.exe`。

### 2. 确认 r-lab 环境存在

```powershell
conda env list
```

### 3. 确认 IRkernel 还在

```powershell
conda run --no-capture-output -n r-lab Rscript -e "library(IRkernel); packageVersion('IRkernel')"
```

### 4. 在 JupyterLab 里重启 kernel

如果刚修改过 `kernel.json`，最好在 JupyterLab 里执行：

```text
Kernel -> Restart Kernel
```

或者直接刷新 JupyterLab 页面，再重新选择：

```text
R (r-lab)
```

---

## 经验教训

在 Windows 上，JupyterLab 从一个 conda 环境启动，kernel 却来自另一个 conda 环境时，不要直接把 kernelspec 写成目标环境里的 `R.exe` 或 `python.exe`。

更稳的写法是：

```text
conda run -n 环境名 命令
```

这次的稳定写法就是：

```text
conda run --no-capture-output -n r-lab R --slave -e IRkernel::main() --args {connection_file}
```
