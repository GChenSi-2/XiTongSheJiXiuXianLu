# Conda / Anaconda 环境重装任务

## 背景说明

这台 Windows 电脑上的 conda 环境已经出现多重问题，反复修复无效，决定彻底重装。请按以下背景和步骤执行。

### 问题现状

- 电脑上曾同时存在 Miniconda（`C:\Users\user\miniconda3`）和 Anaconda（`C:\Users\user\anaconda3`）两套安装，长期混用导致 PATH、`environments.txt`、`envs_dirs` 配置混乱。
- 尝试删除 `miniconda3` 时因文件被占用未删干净，留下残留的 `envs` 子文件夹（如 `ngs`、`r-lab` 环境残骸），指向这些残骸的 Jupyter kernel 均已失效（`WinError 2`）。
- Anaconda Navigator 升级后出现 `ImportError: cannot import name 'DotOrgSite' from 'binstar_client.commands.login'`，说明 base 环境依赖已不一致（很可能是渠道混用：defaults / conda-forge 混装导致）。
- 之后**所有 `conda` 命令（包括 `conda info`、`conda config`）都会卡死不返回**，且每次尝试都会留下一对无法退出的僵尸进程（`conda.exe` + `python.exe`），只能用 `taskkill` 强制清理。
- `mamba` 命令完全正常，不受影响，说明问题出在 conda 自身（Python 实现）的 base 环境包损坏，而非网络或插件问题。
- 尝试用 `mamba install -n base -c defaults conda conda-libmamba-solver --force-reinstall -y` 修复，报错版本冲突（`Could not solve for environment specs`），确认 base 环境包版本已损坏到无法自洽修复的程度。

### 结论

base 环境依赖损坏程度较深，逐个修复的成本已超过重装，决定：**卸载现有 Anaconda3，清理残留配置，重新安装一套干净的发行版，并重建所需的 conda 环境（`r-lab`，用于 R + Jupyter 分析）。**

---

## 执行步骤

### 1. 清理僵尸进程（重装前先执行，避免文件占用报错）

```bash
taskkill /F /IM conda.exe
taskkill /F /IM python.exe
taskkill /F /IM pythonw.exe
tasklist | findstr /i "conda python"
```
确认最后一条命令无输出（无残留进程）后再继续。

### 2. 卸载现有 Anaconda3

- Windows 设置 → 应用 → 搜索 "Anaconda3" → 卸载（使用官方卸载程序，不要手动删文件夹）
- 卸载完成后检查残留：
  ```bash
  dir C:\Users\user\anaconda3
  ```
- 如果文件夹残留删不掉，先确认没有相关进程占用（重复第 1 步的 taskkill/tasklist），再强制删除：
  ```bash
  rmdir /s /q C:\Users\user\anaconda3
  ```

### 3. 清理残留配置文件

```bash
del C:\Users\user\.condarc
rmdir /s /q C:\Users\user\.conda
```

同时检查并清理可能还残留的 miniconda3 痕迹（如果还没清理干净）：
```bash
dir C:\Users\user\miniconda3
```
如果存在，先 taskkill 相关进程，再 `rmdir /s /q C:\Users\user\miniconda3`。

### 4. 重新下载安装

- Anaconda（完整版，体积大，自带常用科学计算包）：https://www.anaconda.com/download
- Miniconda（轻量版，按需自己装包，推荐，避免历史问题重演）：https://www.anaconda.com/download/success 页面下方有 Miniconda 链接

安装时勾选 "Add Anaconda/Miniconda to my PATH environment variable"（虽然官方默认不推荐，但可以减少后续配置步骤）。

安装完成后新开一个终端窗口，确认：
```bash
where conda
conda --version
```
确认路径只指向新安装的这一套，没有旧路径残留。

### 5. 安装 mamba（用于加速后续包管理）

```bash
conda install -n base -c conda-forge mamba -y
```

### 6. 配置 conda（可选，按个人习惯）

```bash
conda config --add channels conda-forge
conda config --add channels bioconda
conda config --set channel_priority strict
```

### 7. 重建 `r-lab` 环境（R + Jupyter 分析环境）

```bash
mamba create -n r-lab python=3.12 r-base r-irkernel jupyterlab -c conda-forge -y
```

### 8. 注册 R kernel 到 Jupyter

```bash
conda activate r-lab
R -e 'IRkernel::installspec(name = "r-lab", displayname = "R (r-lab)")'
```

### 9. 验证

```bash
conda env list
jupyter kernelspec list
jupyter lab
```
在 JupyterLab 里确认能正常选择并启动 `R (r-lab)` 这个 kernel，不再出现 `WinError 2` 或卡死问题。

---

## 注意事项

- 全程只用一套 conda 安装（新装的这套），不要再混用多个 conda/miniconda 发行版。
- 装包统一用 `mamba` 而不是 `conda`，速度更快、更不容易出现依赖求解卡死的问题。
- 不要混用 `defaults` 和 `conda-forge` 渠道装同一个包（容易引发依赖冲突），渠道优先级已在第 6 步设置为 `strict`。
- 如果之后还需要装 Anaconda Navigator，装完先测试能否正常启动（`anaconda-navigator` 命令），避免重蹈覆辙。
