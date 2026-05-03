## Jupytext 使用笔记

### 什么是 Jupytext？

Jupytext 是一个让 Jupyter Notebook 和普通文本文件互相转换的工具。

#### 解决的核心痛点

`.ipynb` 文件本质是 JSON，用 Git 管理很痛苦：
- 每次运行都会改变输出，导致大量 diff
- 代码审查很难看
- 合并冲突很麻烦

---

### 安装

```bash
pip install jupytext
```

---

### 使用方法

#### ① 把现有 Notebook 转成 .py 文件

```bash
jupytext --to py notebook.ipynb
```

生成的 `notebook.py` 长这样：

```python
# %% [markdown]
# # 这是标题

# %%
import pandas as pd
df = pd.read_csv('data.csv')

# %%
df.head()
```

> `# %%` 代表一个 cell 的分隔符。

---

#### ② 把 .py 转回 Notebook

```bash
jupytext --to notebook notebook.py
```

---

#### ③ 双向同步（推荐）

在 notebook 的 cell 里运行：

```python
import jupytext
jupytext.write(jupytext.read('notebook.ipynb'), 'notebook.py')
```

或者在 JupyterLab 里：

```
右键 notebook 文件 → Jupytext → Pair Notebook with percent Script
```

之后每次保存 `.ipynb`，`.py` 文件会**自动同步更新**。

---

#### ④ 配合 Git 的标准工作流

```bash
# .gitignore 里忽略 ipynb
echo "*.ipynb" >> .gitignore

# 只提交 .py 文件
git add notebook.py
git commit -m "update analysis"
```

---

### 注意：conda 环境隔离

在 `base` 环境安装的 Jupytext，切换到其他环境（如 `ngs`）后**无法使用**。

原因是每个 conda 环境都有独立的包目录：

```
anaconda3\Lib\site-packages\jupytext       ← base 环境有
miniconda3\envs\ngs\Lib\site-packages\     ← ngs 环境没有
```

**解决方法：在哪个环境用就在哪个环境装**

```bash
conda activate ngs
pip install jupytext
```

---

### 总结

平时正常用 JupyterLab 写 notebook，Jupytext 在后台自动把代码同步到 `.py` 文件，Git 只管理 `.py` 文件，干净又简单。

```
notebook.ipynb  ←→  notebook.py   （只含代码，适合 Git）
notebook.ipynb  ←→  notebook.md   （Markdown 格式）
```


```python
"""

sync_notebooks.py

将指定目录下所有 .ipynb 文件转换成 MyST Markdown (.md)

用法: python sync_notebooks.py

      python sync_notebooks.py --dir "C:/Users/user/Desktop/operation system"

"""

  

import subprocess

import argparse

from pathlib import Path

  
  

def sync_notebooks(root_dir: Path):

    notebooks = list(root_dir.rglob("*.ipynb"))

  

    # 排除 .ipynb_checkpoints 目录

    notebooks = [nb for nb in notebooks if ".ipynb_checkpoints" not in str(nb)]

  

    if not notebooks:

        print(f"[INFO] No notebooks found in: {root_dir}")

        return

  

    print(f"[INFO] Found {len(notebooks)} notebook(s) in: {root_dir}")

    print()

  

    success, failed = [], []

  

    for nb in notebooks:

        print(f"  Converting: {nb.name} ...")

        result = subprocess.run(

            ["jupytext", "--to", "myst", str(nb)],

            capture_output=True,

            text=True

        )

        if result.returncode == 0:

            print(f"  ✓ Done: {nb.with_suffix('.md').name}")

            success.append(nb)

        else:

            print(f"  ✗ Failed: {nb.name}")

            print(f"    {result.stderr.strip()}")

            failed.append(nb)

  

    print()

    print(f"[DONE] Success: {len(success)}  Failed: {len(failed)}")

  
  

if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Batch convert notebooks to MyST Markdown")

    parser.add_argument(

        "--dir",

        type=str,

        default=".",

        help="Target directory (default: current directory)"

    )

    args = parser.parse_args()

  

    root = Path(args.dir).resolve()

    if not root.exists():

        print(f"[ERROR] Directory not found: {root}")

        exit(1)

  

    sync_notebooks(root)
```