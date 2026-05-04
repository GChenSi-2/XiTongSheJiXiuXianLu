# JupyterLab + AI 集成完整笔记

> 让 AI 操作 / 辅助 JupyterLab notebook 的全套方案对比、选型与配置实践
> 适用场景：conda base 启动 JupyterLab + 自定义 kernel（如 ngs）做数据分析

---

## TL;DR

| 你想要的体验 | 推荐方案 |
|---|---|
| AI 在终端里干活，控制 JupyterLab | Datalayer jupyter-mcp-server + Claude Code |
| JupyterLab 内嵌 chat、ghost text 补全、用 Claude skill | **NBI（notebook-intelligence）✅ 当前最优** |
| JupyterLab 内嵌多 agent（@Claude / @Codex / @Gemini） | jupyter-ai v3（新，观望中） |
| cell 里直接调 LLM，可重现 | jupyter-ai-magic-commands |
| 兼顾 chat + 可重现 magic | NBI + magic（不冲突，推荐组合） |

**核心原则**：装在不同环境隔离，不要全塞 base。

---

## 一、整体方案地图

三种"AI 操作 notebook"的方向，方向是反的：

```
方向 A: AI 在 JupyterLab 外面（终端）
┌──────────────┐                    ┌──────────────┐
│ Claude Code  │ ─── MCP 协议 ──▶  │ JupyterLab   │
└──────────────┘                    └──────────────┘
代表：Datalayer jupyter-mcp-server

方向 B: AI 嵌在 JupyterLab 里面（一体化产品）
┌──────────────────────────────────┐
│  JupyterLab                      │
│  ├── Chat sidebar                │
│  ├── Ghost text 补全              │
│  └── Inline edit                 │
└──────────────────────────────────┘
代表：NBI（notebook-intelligence）

方向 C: AI 嵌在 JupyterLab 里面（协议中间层）
┌──────────────────────────────────┐
│  JupyterLab + ACP host           │
│  └─→ 外部 agent（Claude/Codex/...） │
└──────────────────────────────────┘
代表：jupyter-ai v3
```

---

## 二、四个方案详细对比

### 2.1 Datalayer jupyter-mcp-server

**架构**：独立进程或 Jupyter server extension，通过 MCP 暴露 notebook 操作给外部 AI client。

**关键技术**：
- MCP 协议（对 Claude 暴露 `insert_cell`、`execute_cell` 等工具）
- Y.js / pycrdt RTC 协作层（在 UI 上能看到 cell 实时被 AI 编辑）
- 通过 Jupyter WebSocket 直连 IPython kernel

**LLM 在哪**：在外部 client（Claude Code / Desktop），server 自己不知道 LLM 存在。

**适合**：习惯在终端干活、想让 AI 自主跑 agentic loop。

### 2.2 jupyter-ai v3

**发布时间**：2026-03-31

**架构**：JupyterLab 扩展（server + 前端），作为 ACP host 调用外部 agent，内置 Jupyter MCP server。

```
JupyterLab
├── Frontend: chat sidebar, @-mention 菜单, 权限弹窗
└── Server ext: jupyter_ai
       ├── ACP client → 拉起 claude-agent-acp 子进程
       └── 内置 Jupyter MCP server（给 agent 用）
                   ↓
             外部 agent 子进程 (Claude/Codex/Gemini)
                   ↓
             调 LLM API + 通过 MCP 操作 notebook
```

**关键概念**：
- **ACP**（Agent Client Protocol）：管"对话流"，agent 和 IDE 之间
- **MCP**（Model Context Protocol）：管"工具调用"，agent 和工具之间
- 两个协议正交，组合出无锁定的 agent 生态

**LLM 在哪**：jupyter-ai 自己不调 LLM，全部委托给 ACP agent。

### 2.3 NBI（notebook-intelligence）

**架构**：JupyterLab 扩展（server + 前端），自己实现 LLM provider 抽象、tool 系统、UI 集成。

**关键功能**：
- Chat sidebar
- **Ghost text 行内补全**（这是它独家强项）
- Inline edit
- Cell 上的 sparkle 按钮
- Claude Mode：把 Claude Code CLI 包进来当后端
- Skills 管理 UI（直接在 Settings 里管理 `~/.claude/skills/`）
- Ruleset 系统（`~/.jupyter/nbi/rules/` 下的 markdown 文件自动注入 prompt）

**LLM 在哪**：NBI server extension 直接调（或委托给 Claude Code CLI 子进程）。

### 2.4 jupyter-ai-magic-commands（magic）

**架构**：纯 IPython 扩展，提供 `%ai` / `%%ai` magic。

**关键特性**：
- 在 kernel 进程里执行，不需要 JupyterLab
- 直接 HTTP 调 LLM API
- **没有 agent、没有工具调用、没有上下文记忆**
- 但 **prompt 和模型 ID 全部留在 .ipynb 文件里**，可重现性极高
- 支持 IPython 变量插值：`%%ai claude-... \n 分析 {df.describe()}`
- 支持 `-f` 控制输出格式：`markdown` / `code`（插入新 cell）/ `html` / `math` / ...

**适合**：把 LLM 当成 cell 里一个普通工具，做可重现的 AI-augmented notebook。

### 2.5 四方案并排对比

| 维度            | Datalayer MCP       | jupyter-ai v3    | NBI              | magic          |
| ------------- | ------------------- | ---------------- | ---------------- | -------------- |
| AI 入口         | Claude Code/Desktop | Lab chat sidebar | Lab chat sidebar | cell 里 `%%ai`  |
| 部署形态          | 独立进程                | Lab 扩展           | Lab 扩展           | IPython 扩展     |
| 谁是宿主          | Claude client       | JupyterLab       | JupyterLab       | IPython kernel |
| Ghost text 补全 | ❌                   | ❌                | ✅                | ❌              |
| Agent 操作 cell | ✅                   | ✅                | ✅                | ❌              |
| 多 agent       | 跟 client 走          | ✅ 原生             | ⚠️ 切 mode        | ❌              |
| 多人协作          | ❌                   | ✅                | ❌                | ❌              |
| 可重现性          | ❌                   | ❌                | ❌                | ✅              |
| 成熟度           | 中                   | 低（刚发）            | **高**            | 高              |
| 扩展开发          | MCP 协议              | ACP/MCP 协议       | NBI 内部 API       | IPython API    |
|               |                     |                  |                  |                |

---

## 三、NBI vs jupyter-ai v3 详细对决

### 当前（2026 年 5 月）状态

| 维度 | NBI | jupyter-ai v3 |
|---|---|---|
| 首次发布 | 2024 中 | 2026-03-31 |
| 状态 | 稳定，活跃维护 | 刚发布两个月，incubation |
| Bug 率 | 低 | 较高 |
| 文档 | 完整 | v2 残留多 |

### 功能矩阵

| 功能                | NBI          | v3              |
| ----------------- | ------------ | --------------- |
| Chat              | ✅            | ✅               |
| 多 agent 共存        | ⚠️ 主推 Claude | ✅ 原生 @-mention  |
| **Ghost text 补全** | ✅            | ❌               |
| Inline edit       | ✅            | ❌               |
| Agent 操作 notebook | ✅            | ✅               |
| 多 chat 持久化        | ✅            | ✅（chat 即文件）     |
| 多人实时协作            | ❌            | ✅               |
| 自定义 MCP server    | ✅            | ✅               |
| Skills UI         | ✅            | ❌               |
| Ruleset           | ✅            | ⚠️ 走 agent 自身机制 |
| 自动检测已装 agent      | ❌            | ✅               |

### 架构理念差异

- **NBI = 一体化产品**：自己实现所有层，体验一致，但换 agent 不方便
- **v3 = 协议中间层**：只做 ACP host + MCP server，靠开放协议获得生态红利

### 决策

```
今天就要用、要稳定、要 ghost text、要 Claude skill
  → NBI ✅

团队协作、多 agent 切换刚需
  → v3

观望
  → 现用 NBI，关注 v3.1/v3.2

体验前沿、不怕踩坑
  → v3
```

**对个人 NGS 分析场景：选 NBI**。

---

## 四、安装方案（针对 conda base + ngs kernel）

### 4.1 关键原则

> **AI 工具装在 JupyterLab 进程的 Python 环境里，magic 装在 kernel 环境里。**

原因：
- 前者（NBI / jupyter-ai）是 Jupyter server / Lab 扩展，必须跟 jupyterlab 同环境
- 后者（magic）是 IPython 扩展，由 kernel 进程加载执行

### 4.2 推荐的最终结构

```
conda envs:
├── base                              ← Jupyter 主入口
│   ├── jupyterlab
│   ├── notebook-intelligence         ← 主力工作
│   └── nodejs + claude-code CLI
│
├── ngs                               ← 分析 kernel（不动）
│   ├── pysam, pandas, ...
│   ├── ipykernel
│   └── jupyter-ai-magic-commands     ← magic 装这里
│
└── jai                               ← 偶尔试 v3
    ├── jupyterlab
    ├── jupyter-ai
    └── nodejs + claude-code + claude-agent-acp
```

### 4.3 安装步骤

```bash
# === Step 1: base + NBI ===
conda activate base
pip install jupyterlab notebook-intelligence
conda install nodejs
npm install -g @anthropic-ai/claude-code

# === Step 2: ngs + magic ===
conda activate ngs
pip install jupyter-ai-magic-commands anthropic
# 注册 kernel（如果还没注册过）
python -m ipykernel install --user --name ngs --display-name "Python (ngs)"

# === Step 3: jai env + jupyter-ai v3（可选）===
conda create -n jai python=3.13 jupyterlab nodejs
conda activate jai
pip install jupyter-ai
npm install -g @anthropic-ai/claude-code @agentclientprotocol/claude-agent-acp
```

### 4.4 启动方式

```bash
# 主力工作（用 NBI）
conda activate base
jupyter lab --port 8888

# 试 v3（不同端口）
conda deactivate
conda activate jai
jupyter lab --port 8889
```

### 4.5 验证链路

打开 notebook → 选 Python (ngs) kernel → 跑：

```python
import sys
print(sys.executable)
```

输出应该是 ngs 环境的 python，证明 server 和 kernel 链路正确。

---

## 五、为什么不能全塞 base

### 5.1 一句话答案

**保护已验证可用的环境不被未验证的东西污染**。

### 5.2 高概率会出问题

1. **依赖版本冲突**
   - jupyter-ai v3 引入 `jupyter_server_documents`，会替换 / 干扰标准的 Jupyter server 文件管理机制
   - 这影响**所有** Lab 操作，包括 NBI 的 cell 编辑
   - NBI 没针对此做适配测试

2. **前端 plugin 注册冲突**
   - 两个 chat sidebar 图标
   - 两套 cell sparkle 按钮
   - keyboard shortcut 撞车（`Ctrl+Shift+I` 等）

3. **MCP server 端口/资源争用**
   - 同一个 `notebook_run_cell` 工具名出现两次，agent 不知道调哪个

### 5.3 中概率烦人

4. **ACP adapter 进程管理混乱**
   - 启动慢、内存翻倍
   - Claude 登录态被交替写入 `~/.claude/credentials.json`

5. **日志调试地狱**
   - 无法区分错误来自哪个扩展
   - 提 issue 时还是要回去搭独立环境复现

### 5.4 低概率难修

6. **配置文件互相覆盖**

7. **magic 包名潜在冲突**

### 5.5 隔离的成本/收益

| | 成本 | 收益 |
|---|---|---|
| 分开装 | 多敲 `conda activate`、占几百 MB、记两个端口 | 规避以上 7 类问题 |
| 全塞 base | 单一环境 | 任何一个问题都能毁掉日常工作流 |

base 是**主力生产环境**，v3 是**探索性使用**——隔离逻辑跟"prod 不直接跑实验 schema"一致。

---

## 六、组合使用：NBI + magic

### 6.1 为什么不冲突

| | NBI | magic |
|---|---|---|
| 装在哪 | base | ngs |
| 进程 | Jupyter server / Lab | IPython kernel |
| 触发方式 | UI（chat / ghost text）| cell 里 `%%ai` |
| 协议 | NBI 自定义 | 直接 HTTP |

不同环境、不同进程、不同触发方式，**根本碰不到面**。

### 6.2 推荐工作流

```
写代码、调试、做实验
  → NBI sidebar 跟 Claude 聊

生成最终报告 notebook
  → NBI agent 帮搭框架，里面用 %%ai cell 留 AI 解读

快速问个问题
  → cell 里 %%ai claude-... ...，比切到 sidebar 快
```

### 6.3 防止 NBI agent 滥用 magic

在 `~/.jupyter/nbi/rules/` 放约束 markdown：

```markdown
---
priority: 10
---

- 不要为了回答我的问题而插入 %%ai magic cell
- 只有在我明确要求"在 notebook 里留一个 AI 解读 cell"或要做模型对比时才用 magic
- 你自己回答用 chat sidebar 就好
```

NBI 的 ruleset 系统会自动注入到 system prompt。

### 6.4 magic 自动加载

不想每次都跑 `%load_ext jupyter_ai_magic_commands`：

```python
# ~/.ipython/profile_default/ipython_config.py（在 ngs env 里）
c.InteractiveShellApp.extensions = ['jupyter_ai_magic_commands']
```

profile 是按 Python 环境走的，只在 ngs kernel 自动加载，base 不受影响。

---

## 七、能不能让 chat agent 调 magic

### 7.1 技术上可以，但通常是反模式

agent 本身就是 LLM 驱动，再让它调 `%%ai` 等于 **LLM 调用 LLM**。

**坏处**：
- 双重 token 消耗
- 上下文割裂（agent 看不到 magic 内部"思考"）
- 权限弹窗骚扰
- API key 账单分两边
- 可重现性变假

### 7.2 真正有意义的少数场景

1. **不同 provider 模型对比**：让 agent 写 `%%ai openai:gpt-4 ...` 看不同模型的解读
2. **产出可重现的 AI-augmented notebook**：agent **代你写**包含 magic 的 notebook，给别人重跑

关键区别：**agent 代你写 magic ≠ agent 自己调 magic 来回答**。

### 7.3 判断标准

> "如果这个 magic cell 删掉，agent 能不能直接给我答案？"
> - 能 → 不需要 magic
> - 不能 → 才用 magic

---

## 八、kernel 选择和 magic 安装位置

### 8.1 kernel 注册是全局的

```bash
conda activate ngs
python -m ipykernel install --user --name ngs --display-name "Python (ngs)"
```

这写到 `~/.local/share/jupyter/kernels/`，**所有 conda env 启动的 Lab 都能看到**。

```bash
jupyter kernelspec list  # 在 base / jai / 任何 env 里跑都一样
```

### 8.2 MCP server / ACP / NBI 装哪

**它们跟 kernel 完全无关**。流程是：

```
Lab 进程（base 或 jai）
  └── NBI / jupyter-ai 扩展
         └── 通过 Jupyter REST API 操作 notebook
               └── Jupyter server 把执行请求发给 ngs kernel
                     └── kernel 在 ngs 环境跑代码
```

中间 NBI / jupyter-ai 只跟 Jupyter server 打交道，不用关心 kernel 是什么。所以**装在 base 即可，不需要装到 ngs**。

### 8.3 magic 必须装在 kernel 环境

magic 是 IPython 扩展，由 kernel 进程加载。**装到 base 没用**，必须装到 ngs。

### 8.4 验证小技巧

让 AI 跑 `import sys; print(sys.executable)`：
- 输出 ngs 的 python 路径 → 链路正确
- 输出 base 的 python 路径 → kernel 选错了

---

## 九、ACP 和 MCP 的协作（v3 工作原理）

一次完整调用：

```
1. 用户输入 "@Claude 跑一下当前 cell"
   ↓
2. jupyter-ai server ext 收到 → 通过 ACP 协议丢给 claude-agent-acp 子进程
   ↓
3. claude-agent-acp 调 Anthropic API
   LLM 返回："我要调用 notebook_run_cell 工具"
   ↓
4. claude-agent-acp 通过 MCP 协议调 jupyter-ai 内置 MCP server
   MCP server 转换为 Jupyter API 调用
   ↓
5. Jupyter server 把执行请求发给 ngs kernel
   kernel 跑代码，输出 stream/display_data 回流
   ↓
6. 输出沿原路返回：kernel → MCP → ACP → Jupyter AI → chat UI
```

**为什么要套两层协议**：
- ACP 管"对话流"（消息流、思考过程、权限请求）
- MCP 管"工具调用"（一个个原子操作）
- 关注点分离

---

## 十、常见坑和排查

### 坑 1：装完没看到 @Claude / NBI 图标

- 检查 `which claude`、`which claude-agent-acp` 是否在 PATH
- jupyter-ai / NBI 是**启动时**扫描 agent，装新 agent 后必须重启 Lab
- 看 Lab 启动日志，搜 `persona` / `notebook_intelligence`

### 坑 2：kernel 跑的不是 ngs 环境

- jupyter-ai / NBI 不会替你切 kernel
- 打开 notebook 后**手动**选 ngs kernel
- 用 `import sys; print(sys.executable)` 验证

### 坑 3：包冲突

- 报错就开新 venv / conda env
- 别试图修复混装环境，重装更快

### 坑 4：Claude 一直要登录

- ACP adapter 进程的环境变量可能没继承
- 先在 shell 里跑 `claude` 完成登录
- 确认 `~/.claude/credentials.json` 存在
- 再启动 Lab

### 坑 5：%%ai magic 不能用

- v3 默认不装 magic 包
- 装到 **kernel 环境**（ngs，不是 base）
- 第一次用要 `%load_ext jupyter_ai_magic_commands`

### 坑 6：API key 配置

最稳：启动 Lab 之前在 shell 里 export，所有进程都能读：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
conda activate base
jupyter lab
```

---

## 十一、决策树（最终版）

```
我要在 JupyterLab 里用 AI
│
├─ 我习惯在 Claude Code 终端干活
│   └─→ Datalayer jupyter-mcp-server
│
├─ 我大部分时间在 JupyterLab UI 里
│   │
│   ├─ 要 ghost text、要 Claude skill 集成、要稳定
│   │   └─→ NBI ✅（推荐）
│   │
│   ├─ 要多 agent、多人协作、不怕踩坑
│   │   └─→ jupyter-ai v3
│   │
│   └─ 想要可重现的 AI-augmented notebook
│       └─→ 加装 jupyter-ai-magic-commands（到 kernel 环境）
│
└─ 我只想偶尔在 cell 里调 LLM
    └─→ jupyter-ai-magic-commands 单装（不需要 v3 全套）
```

---

## 十二、参考资料

- jupyter-ai v3 官方: https://jupyter-ai.readthedocs.io/en/v3/
- jupyter-ai v3 release issue: https://github.com/jupyterlab/jupyter-ai/issues/1531
- ACP 协议: https://agentclientprotocol.com
- Claude Code ACP adapter: `@agentclientprotocol/claude-agent-acp` (npm)
- Datalayer jupyter-mcp-server: https://github.com/datalayer/jupyter-mcp-server
- NBI: https://github.com/notebook-intelligence/notebook-intelligence
- jupyter-ai-magics PyPI: https://pypi.org/project/jupyter-ai-magics/
