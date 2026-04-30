---
tags:
  - 工具链
  - 工作流
  - 生物信息
  - 数据分析
created: 2026-04-28
---

## Obsidian × Jupyter × Quarto 三工具联动指南

### 架构总览

```
┌─────────────────────────────────────────────┐
│              Obsidian Vault                  │
│   知识管理层：写笔记、组织思路、查看结果      │
│        (.md / .qmd 文件统一存放)             │
└────────────┬──────────────┬─────────────────┘
             │ Jupytext      │ quarto render
             ↕ 双向同步      ↓ 输出 .md 回 vault
┌────────────┴──────┐  ┌────┴────────────────┐
│   JupyterLab      │  │      Quarto          │
│   计算执行层       │  │   渲染发布层         │
│  (.ipynb 运行代码) │  │ (.qmd → MD/HTML/PDF) │
└───────────────────┘  └─────────────────────┘
```

**核心原则**：Vault 是唯一文件中心，所有 `.md`、`.qmd`、`.ipynb` 都存在 vault 里。

---

### 第一步：安装依赖

#### 1.1 安装 Quarto CLI

前往官网下载安装：<https://quarto.org/docs/get-started/>

```bash
# 验证安装
quarto --version
```

#### 1.2 安装 Python 依赖

```bash
pip install jupytext jupyterlab
```

#### 1.3 安装 JupyterLab 的 Jupytext 扩展

```bash
pip install jupyterlab-jupytext
```

#### 1.4 安装 R（可选，做生信必装）

前往 <https://cran.r-project.org/> 安装 R，再安装 RStudio。

```r
# 在 R 里安装 Quarto 支持包
install.packages("rmarkdown")
install.packages("knitr")
```

---

### 第二步：配置 Jupytext（Jupyter ↔ Obsidian 双向同步）

在 vault 根目录创建 `jupytext.toml`：

```toml
# vault 根目录的 jupytext.toml
[formats]
# .ipynb 和 .md 自动配对同步
# MyST 格式的 Markdown 对 Obsidian 最友好
notebook = "ipynb,myst"
```

**效果**：
- 在 JupyterLab 打开 `.ipynb` → 自动生成/更新同名 `.md`（Obsidian 可读）
- 在 Obsidian 编辑 `.md` → JupyterLab 打开时自动同步

#### 手动配对已有 Notebook

```bash
# 将已有 notebook 配对到 MyST Markdown
jupytext --set-formats ipynb,myst notebook.ipynb

# 同步（从 ipynb 更新 md）
jupytext --sync notebook.ipynb
```

---

### 第三步：配置 Quarto（渲染 .qmd 回 vault）

在 vault 根目录或研究项目文件夹创建 `_quarto.yml`：

```yaml
project:
  type: default
  output-dir: _output   # 渲染结果存到 vault/_output/

format:
  # 主输出格式：GitHub Flavored Markdown（Obsidian 兼容）
  gfm:
    wrap: none
    toc: true

execute:
  freeze: auto          # 未改变的代码块不重新运行（加速）
  cache: true           # 缓存计算结果

# 支持 Python + R 混用
jupyter: python3        # 或 ir（R kernel）
```

#### Quarto 文档模板（.qmd 文件）

````markdown
---
title: "RNA-seq 差异表达分析"
author: "Your Name"
date: today
format: gfm
execute:
  echo: true
  warning: false
---

## 加载数据

```{python}
import pandas as pd
import scanpy as sc

adata = sc.read_h5ad("data/sample.h5ad")
print(adata)
```

## R 做差异分析

```{r}
library(DESeq2)
# DESeq2 分析代码
```

## 结果可视化

```{python}
sc.pl.umap(adata, color='cell_type')
```
````

#### 渲染命令

```bash
# 渲染单个文件
quarto render analysis.qmd

# 渲染整个项目
quarto render

# 实时预览（改动自动刷新）
quarto preview analysis.qmd
```

---

### 第四步：Obsidian 插件配置

#### 必装插件

| 插件名 | 作用 |
|--------|------|
| **Execute Code** | 在 Obsidian 里直接运行代码块 |
| **Obsidian Git** | vault 版本控制，同步 notebook 变更 |
| **Dataview** | 查询 vault 里的分析结果 |

#### Execute Code 配置

Settings → Execute Code：
- Python path：填入你的 Python 路径（`which python` 查看）
- Working directory：设为 vault 根目录

---

### 日常工作流

#### 场景 A：探索性分析

```
1. 在 Obsidian 新建笔记，写下分析思路
2. 打开 JupyterLab，在 vault 目录下新建 .ipynb
3. Jupytext 自动生成同名 .md → Obsidian 实时可见
4. 跑完代码后 quarto render → _output/ 生成带图表的 .md
5. 在 Obsidian 笔记里用 [[链接]] 引用分析结果
```

#### 场景 B：撰写分析报告

```
1. 在 Obsidian 里新建 .qmd 文件，边写边引用分析
2. JupyterLab 打开同一个 .qmd 执行代码（Quarto 支持直接在 Jupyter 里跑）
3. quarto render → 生成 HTML 报告 / PDF 论文
4. 结果 .md 自动存回 vault，可以 [[wikilink]] 引用
```

#### 场景 C：发表论文

```
.qmd（混合 R + Python）
    ↓ quarto render --to pdf
论文 PDF（含图表、引用、公式）
```

---

### 推荐目录结构

```
vault/
├── _quarto.yml              ← Quarto 项目配置
├── jupytext.toml            ← Jupytext 同步配置
├── _output/                 ← Quarto 渲染结果（自动生成）
│
├── 知识管理/
│   └── 研究工作流/          ← 本笔记所在位置
│
├── research/                ← 研究项目
│   ├── project-A/
│   │   ├── analysis.qmd     ← 主分析文档
│   │   ├── analysis.ipynb   ← Jupyter 执行版（Jupytext 配对）
│   │   ├── analysis.md      ← Obsidian 可读版（Jupytext 生成）
│   │   └── data/
│   └── project-B/
│
└── OSnote/                  ← 现有笔记
```

---

### 快速参考

```bash
# 启动 JupyterLab（在 vault 目录下）
cd "vault路径" && jupyter lab

# 同步所有 notebook
jupytext --sync **/*.ipynb

# 渲染所有 .qmd
quarto render

# 实时预览某个文档
quarto preview research/project-A/analysis.qmd
```

---

### 参考资源

- Quarto 官网：<https://quarto.org>
- Jupytext 文档：<https://jupytext.readthedocs.io>
- Quarto + Jupyter 指南：<https://quarto.org/docs/tools/jupyter-lab.html>
