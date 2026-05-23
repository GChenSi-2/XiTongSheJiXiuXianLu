# Jupyter + Conda 配置总结

> 整理自一次完整的环境诊断对话。从"工作区到底是哪个文件夹"出发,
> 一路追到 conda 环境、kernel 注册、启动脚本编写。

---

## 一、关键概念辨析

容易被混淆的三个"workspace":

| 名字 | 是什么 | 由谁管 | 存在哪 |
|---|---|---|---|
| **Server root_dir** | Jupyter 文件浏览器的根目录 | `c.ServerApp.root_dir`(配置文件) | `~/.jupyter/jupyter_lab_config.py` |
| **JupyterLab Workspace** | 标签页 / 面板布局快照 | JupyterLab 前端 | `~/.jupyter/lab/workspaces/*.jupyterlab-workspace` |
| **Conda 环境(env)** | Python 解释器 + 库 + 可执行文件 | conda | `<miniconda>/envs/<name>/` |

三者**完全独立**,conda 不管前两个,Jupyter 不管最后一个。

---

## 二、`.jupyter/lab/workspaces/` 里那些文件

- 都是 **JSON 状态快照**,不是 notebook 本体,真实 .ipynb 在别处
- `default-*.jupyterlab-workspace`:访问 `/lab` 时使用的默认布局
- `auto-X-XXXX.jupyterlab-workspace`:JupyterLab 检测到**多个浏览器标签同时打开**时,把后开的 tab 重定向到一个新工作区,避免布局互相覆盖
- 文件名里的 `auto-<随机字符>` 是引擎自动生成的,**不是用户起的**
- 可以放心删除,不影响任何 .ipynb 文件

---

## 三、Conda 环境隔离的原理

每个环境就是磁盘上的**一个独立文件夹**:

```
miniconda3\
   ├─ python.exe                  ← base 的 Python
   ├─ Scripts\                    ← base 的可执行文件
   ├─ Lib\site-packages\          ← base 的库
   └─ envs\
        └─ ngs\
             ├─ python.exe        ← ngs 自己的 Python
             ├─ Scripts\
             └─ Lib\site-packages\
```

`conda activate ngs` 做的事只有一件:**把环境的目录插到 PATH 最前面**,并设置 `CONDA_PREFIX`。

之后:
1. 输入 `python` → 命中 PATH 第一个 `python.exe` = 环境的 Python
2. Python 启动时根据自身位置推断 `sys.prefix`
3. `sys.path` 自动指向 `<sys.prefix>\Lib\site-packages`
4. 所有 `import` 只能看到这个环境的库

整个隔离的本质就是 **PATH 优先级 + Python 自定位** 两件事的组合。

---

## 四、`channel` 是什么

**channel = conda 的软件仓库**,类似 pip 的 PyPI。

| channel | 用途 |
|---|---|
| `defaults` | Anaconda 官方源,商业级稳定 |
| `conda-forge` | 社区维护,包最全更新最快 |
| `bioconda` | 生信工具(samtools 等) |
| `pytorch` / `nvidia` | 厂商自己的官方源 |

- `conda install xxx` 会**按优先级**遍历所有配置的 channel
- channel 越多,每次操作要拉的 repodata 越多 → 越慢
- 装包卡死 90% 是 channel 网络问题
- 救急:`-c conda-forge --override-channels` 只用一个源

⚠️ **PyPI 镜像 ≠ conda 镜像**:
- PyPI 镜像(给 pip):`https://pypi.tuna.tsinghua.edu.cn/simple`
- conda 镜像(给 conda):`https://mirrors.tuna.tsinghua.edu.cn/anaconda/`

两套独立服务,域名相似但用法完全不同。

---

## 五、Jupyter Server 与 Kernel 是两码事

```
JupyterLab 服务器(Web 应用)
     ↓ spawn
   ┌───────┴───────┐
Kernel A         Kernel B
(子进程)         (子进程)
ngs 的 python    base 的 python
```

- **服务器**只是网页 + 路由,跟代码执行无关
- **Kernel**是独立子进程,真正跑代码
- 服务器从哪个环境启动,和 kernel 用哪个环境**完全无关**

### Kernel 的注册机制

```bash
python -m ipykernel install --user --name ngs --display-name "Python (ngs)"
```

会在 `C:\Users\user\AppData\Roaming\jupyter\kernels\ngs\` 写一个 `kernel.json`,里面 `argv[0]` 是该环境 python.exe 的**绝对路径**。

**`--user` 至关重要**:写进用户级目录,任何 Jupyter 服务器都能扫描到;不加则只对当前 env 内的 jupyter 可见。

### 验证内核注册

```bash
jupyter kernelspec list
```

---

## 六、典型陷阱:伪 conda 启动

启动 .bat 里只写 `python -m jupyterlab` 而**不 activate conda**,会:

1. 用 PATH 里第一个 `python.exe`(可能是系统 Python 3.13,不是 base)
2. 加载该 Python 的 site-packages
3. **完全绕开 conda**,即使提示符显示 `(base)` 也是错觉

正确做法:`call activate.bat base` 之后,**用绝对路径**调用 jupyter:

```bat
"%CONDA_PREFIX%\Scripts\jupyter.exe" lab ...
```

绝对路径保证不会被 PATH 里残留的别家 jupyter 抢走。

---

## 七、可靠的启动脚本骨架

```bat
@echo off
chcp 65001 >nul

REM 1. 激活 conda
call "C:\Users\user\miniconda3\Scripts\activate.bat" base
if errorlevel 1 ( echo activate failed & pause & exit /b 1 )

REM 2. 验证 CONDA_PREFIX 设置成功
if not defined CONDA_PREFIX ( echo no CONDA_PREFIX & pause & exit /b 1 )

REM 3. 验证 jupyter 真在这个 env 里
if not exist "%CONDA_PREFIX%\Scripts\jupyter.exe" (
    echo jupyter not in env & pause & exit /b 1
)

REM 4. 用绝对路径启动,--ServerApp.root_dir 覆盖配置文件
"%CONDA_PREFIX%\Scripts\jupyter.exe" lab --ServerApp.root_dir="<你想要的根目录>"
pause
```

要点:
- **纯 ASCII**(避免日文 / 中文 Windows 编码问题)
- `chcp 65001` 切换 UTF-8 代码页
- 三道前置检查,任何一关失败都给清晰错误而非黑屏
- `--ServerApp.root_dir=<path>` 命令行参数**优先级高于**配置文件

---

## 八、新建环境的标准流程

```bash
REM 1. 建环境(顺手装 ipykernel)
conda create -n yolo python=3.11 ipykernel -c conda-forge --override-channels -y

REM 2. 激活
conda activate yolo

REM 3. 装项目特定的库
pip install ultralytics torch

REM 4. 注册成 Jupyter 内核
python -m ipykernel install --user --name yolo --display-name "Python (yolo)"
```

### Python 版本建议(2025-2026)

- **首选 `python=3.11`**:几乎所有库都兼容
- 避开 `3.13`(太新,部分 ML 库无 wheel)
- 避开 `3.9`(进入 EOL)

---

## 九、命令速查

| 操作 | 命令 |
|---|---|
| 看所有环境 | `conda env list` |
| 看环境装了什么 | `conda list -n <env>` |
| 激活 / 退出 | `conda activate <env>` / `conda deactivate` |
| 删除环境 | `conda env remove -n <env>` |
| 导出环境定义 | `conda env export -n <env> > environment.yml` |
| 从定义重建 | `conda env create -f environment.yml` |
| 查看 conda 版本信息 | `conda info` 或 `conda --version` |
| 查 channel 配置 | `conda config --show channels` |
| 列出已注册 kernel | `jupyter kernelspec list` |
| 删除已注册 kernel | `jupyter kernelspec remove <name>` |
| 清理 conda 缓存 | `conda clean --all` |
| 启用 libmamba 求解器 | `conda config --set solver libmamba` |

---

## 十、本次清理给本机留下的健康架构

```
启动入口   :  启动JupyterLab.bat (强制走 base + 绝对路径)
                  ↓
JupyterLab :  miniconda3\base
                  ↓
内核选择   :  base / ngs / <未来项目环境>
                  ↓
文件根目录 :  C:\Users\user\Desktop\operation system
```

后续可继续清理的"备胎":
- `C:\Users\user\anaconda3\`(孤儿 Anaconda3,可删)
- `C:\Python313\`(系统级 Python 3.13,确认没别的工具依赖后可卸)
- `C:\Users\user\AppData\Local\Programs\Python\Python39\`(同上)
- `C:\Users\user\AppData\Roaming\Python\Python313\`(Python 3.13 的 user-site,跟着卸)

清理后整台机器只保留 miniconda3 一套 Python 体系。
