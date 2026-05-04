## Jupyter AI V3 实现路线笔记

> 把 AI Agent 装进 JupyterLab UI 里，让 @Claude 直接在 chat sidebar 里读、写、跑你的 notebook。
> 官方 v3.0 release: 2026-03-31

---

### TL;DR

- **不是** 让 Claude Code 反过来控制 JupyterLab
- **而是** 在 JupyterLab 里嵌入一个聊天界面，可以 `@Claude`、`@Codex`、`@Gemini` 等多个外部 agent
- 底层通过两个开放协议串起来：**ACP**（Agent ↔ Jupyter AI）+ **MCP**（Agent ↔ Notebook 工具）
- v3 跟 v2 是完全不同的架构，v2 那套 Jupyternaut/`%%ai` magic 已经退到次要位置（仍可选）

---

### 一、架构概览

```
┌─────────────────────────────── JupyterLab ───────────────────────────────┐
│                                                                          │
│  Frontend (TypeScript)              Server extension (Python)            │
│  ┌──────────────────────┐           ┌────────────────────────────────┐   │
│  │  Chat sidebar        │           │  jupyter_ai                    │   │
│  │  - 多 chat 文件        │ ◀── WS ──▶│  - Persona manager             │   │
│  │  - @-mention 菜单      │           │  - ACP client                  │   │
│  │  - 权限确认弹窗         │           │  - 内置 Jupyter MCP server     │   │
│  └──────────────────────┘           └─────────┬──────────────────────┘   │
│                                               │                          │
└───────────────────────────────────────────────┼──────────────────────────┘
                                                │ ACP (stdio)
                                                ▼
                              ┌─────────────────────────────────┐
                              │  外部 Agent 进程 (子进程)         │
                              │  - claude-code (npm)            │
                              │  - codex (npm)                  │
                              │  - gemini-cli (npm)             │
                              │  - goose / kiro / opencode ...  │
                              └─────────────────────────────────┘
                                                │ MCP (内部回调)
                                                ▼
                              ┌─────────────────────────────────┐
                              │  Jupyter MCP Server (内置)       │
                              │  → 读/写 cell、跑 cell、看输出    │
                              └─────────────────────────────────┘
```

关键点：**Jupyter AI 自己不调 LLM**。它是 ACP 的 host，把 Claude Code 这类 agent 当子进程拉起来，用户的消息走 ACP 协议丢过去，agent 自己去调 LLM、自己回流。

---

### 二、核心概念

| 概念                               | 解释                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| **ACP** (Agent Client Protocol)  | Zed 主推的协议，定义"agent 进程"和"宿主 IDE"之间怎么对话（消息、工具调用、权限）。Jupyter AI 是 ACP client，agent 是 ACP server。 |
| **MCP** (Model Context Protocol) | Anthropic 主推的协议，定义"工具提供方"和"LLM"之间怎么对话。Jupyter AI 内置一个 MCP server 给 agent 使用。                  |
| **AI Persona**                   | Jupyter AI 里一个 agent 的呈现形式。安装哪个 agent CLI，就自动出现对应的 persona（@Claude、@Codex…）。                |
| **Chat 文件**                      | 每个对话是一个文件存在 workspace 里，可以关掉再打开恢复，可以多人协作。                                                     |
| **权限系统**                         | agent 写文件、跑命令、调用 MCP 工具前，会弹窗让用户点确认。                                                           |

**协议分工的本质**：
- ACP 解决"谁是 agent"（可以换 Claude / Codex / Gemini）
- MCP 解决"agent 能做什么"（可以加 GitHub / Slack / 自定义工具）
- 两个协议正交，组合出来就是无锁定的 agent 生态

---

### 三、安装（针对 Conda Base + 自定义 Kernel 环境）

#### 3.1 选择安装位置

| 选项      | 推荐度  | 理由                                                           |
| ------- | ---- | ------------------------------------------------------------ |
| 装在 base | ⭐⭐⭐  | 你的 JupyterLab 就在 base，jupyter-ai 是 Lab extension 必须跟 Lab 同环境 |
| 装在 ngs  | ❌    | ngs 是 kernel 环境，不跑 JupyterLab，装了没用                           |
| 单开 venv | ⭐⭐⭐⭐ | 最干净，但你得在新 venv 里重装 jupyterlab                                |

**结论**：装到 `base`。jupyter-ai 必须跟 `jupyterlab` 在同一个 Python 环境，没有第二个选择。ngs kernel 不受影响——因为 jupyter-ai 操作 notebook 是通过 Jupyter server 的 API，最终落到哪个 kernel 由 notebook 自己决定。

#### 3.2 安装步骤

```bash
# Step 1: 装 jupyter-ai 主包到 base
conda activate base
pip install jupyter-ai

# Step 2: 装 Node.js (Claude Code 的 ACP adapter 是 npm 包)
conda install nodejs

# Step 3: 装 Claude Code CLI 本体
npm install -g @anthropic-ai/claude-code

# Step 4: 装 Claude 的 ACP adapter (这一步是 v3 必需的桥接层)
npm install -g @agentclientprotocol/claude-agent-acp

# Step 5: 启动 JupyterLab
jupyter lab
```

#### 3.3 第一次登录 Claude

启动后在 chat 里 `@Claude 你好`，它会提示登录。Jupyter AI 会自动开一个终端 tab，里面跑 `claude` 命令引导你完成 OAuth。登录信息会持久化（`~/.claude/`），后续不用重复。

#### 3.4 验证

在 chat 里输入：

```
@Claude 帮我写一个 cell，打印当前 Python 解释器路径
```

Claude 会请求权限调用 `notebook_insert_cell` 等工具，确认后插入 cell。让它跑一下 `import sys; print(sys.executable)`，输出应该是 ngs 环境的 python 路径——这就证明链路通了。

---

### 四、ACP 和 MCP 是怎么协作的

一次完整调用的数据流：

```
1. 用户在 chat 输入  "@Claude 跑一下当前 cell"
   │
   ▼
2. Jupyter AI server extension 收到消息
   - 解析 @Claude → 路由到 Claude persona
   - 通过 ACP 协议把消息丢给 claude-agent-acp 子进程
   │
   ▼
3. claude-agent-acp 调 Anthropic API
   - LLM 返回: "我要调用 notebook_run_cell 工具"
   │
   ▼
4. claude-agent-acp 通过 MCP 协议调 Jupyter AI 内置的 MCP server
   - MCP server 转换为 Jupyter API 调用
   │
   ▼
5. Jupyter server 把执行请求发给 ngs kernel
   - kernel 跑代码，输出 stream/display_data 回流
   │
   ▼
6. 输出沿原路返回: kernel → MCP → ACP → Jupyter AI → chat UI
```

**为什么要套两层协议？** 因为关注点不同：
- ACP 管"对话流"（消息流、思考过程、权限请求）
- MCP 管"工具调用"（一个个原子操作）

agent 内部是 LLM agent loop，外部要被 IDE 控制，所以两个协议都需要。

---

### 五、内置 Jupyter MCP Server 暴露的能力

agent 可以调用的工具（部分）：

| 工具 | 作用 |
|---|---|
| `notebook_list` | 列出 workspace 下所有 notebook |
| `notebook_open` | 打开一个 notebook |
| `notebook_read_cells` | 读 cell 内容 |
| `notebook_insert_cell` | 插入新 cell |
| `notebook_overwrite_cell` | 覆盖 cell 源码 |
| `notebook_apply_edit` | 局部 find-and-replace 编辑 |
| `notebook_run_cell` | 执行 cell（带超时，多模态输出） |
| `notebook_execute_code` | 直接在 kernel 里跑代码（不写入 notebook） |
| `file_read` / `file_write` | 文件操作 |
| `shell_execute` | 跑 shell 命令 |

写入操作走 Jupyter 的 **RTC（实时协作）层**——你 UI 里能看到 cell 实时被插入和修改，不需要刷新。

---

### 六、加自定义 MCP Server

如果想给 agent 加额外工具（比如你常用的 Notion MCP、Bigdata.com MCP），编辑 Jupyter AI 配置：

```json
// ~/.jupyter/lab/user-settings/@jupyter-ai/core/plugin.jupyterlab-settings
{
  "mcpServers": {
    "notion": {
      "url": "https://mcp.notion.com/mcp"
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_xxx" }
    }
  }
}
```

效果：所有 agent（@Claude / @Codex / @Gemini）都能用上这些工具，不用每个 agent CLI 单独配。

---

### 七、和其他方案的区别（一图看懂）

| 维度       | jupyter-ai v3 | Datalayer MCP         | NBI               |
| -------- | ------------- | --------------------- | ----------------- |
| AI 在哪    | JupyterLab 内  | Claude Code/Desktop 内 | JupyterLab 内      |
| 谁是宿主     | JupyterLab    | Claude client         | JupyterLab        |
| Agent 切换 | ✅ 多 agent 共存  | 跟 client 走            | 主推 Copilot/Claude |
| 行内补全     | ❌ (v3 暂时移除)   | ❌                     | ✅ ghost text      |
| 多 chat   | ✅ 文件化         | 单 session             | ✅                 |
| 适合场景     | 想留在 Lab 里干活   | 想留在终端干活               | 要 Copilot 体验      |
|          |               |                       |                   |

---

### 八、常见坑

#### 坑 1: 装完没看到 @Claude

- 检查 `which claude` 和 `which claude-agent-acp` 是不是在 PATH 里
- jupyter-ai 是**启动时**扫描 agent 的，装新 agent 后必须重启 Lab
- 看 Lab 启动日志，搜 `persona` 关键字

#### 坑 2: Kernel 跑的不是 Ngs 环境

- jupyter-ai 不会替你切 kernel
- 打开 notebook 后手动选 ngs kernel，agent 后续操作都基于这个 kernel
- 让 agent 跑 `import sys; print(sys.executable)` 验证

#### 坑 3: 包冲突

- `jupyter-ai` v3 依赖了一堆 jupyter 生态新包（`jupyter_chat`、`jupyter_server_documents`、`jupyter_ai_acp_client` 等），可能跟 base 里旧版本冲突
- 报错就开新 venv：`python -m venv ~/jai-env && source ~/jai-env/bin/activate && pip install jupyterlab jupyter-ai`
- 然后在新 venv 里再 `python -m ipykernel install --name ngs …` 重新注册 ngs kernel（kernelspec 是 Jupyter 全局的）

#### 坑 4: Claude 一直要登录

- ACP adapter 进程的环境变量可能没继承
- 解决：先在 shell 里跑一次 `claude` 完成登录，确认 `~/.claude/credentials.json` 存在
- 然后再启动 Lab

#### 坑 5: %ai Magic 不能用

- v3 默认不装 `jupyter_ai_magics`
- 想用：`pip install jupyter-ai-magics`，并且要装到 **kernel 环境里**（也就是 ngs，不是 base），因为 magic 是在 kernel 进程里执行的

---

### 九、可以做但不推荐的事

- **同时装 jupyter-ai 和 NBI**：技术上可行，UI 会出现两个 chat sidebar，容易混乱
- **在 jupyter-ai 里同时挂 Datalayer MCP**：重复——jupyter-ai 已经内置了同等功能的 MCP server
- **跨 conda env 共享 ACP adapter**：npm 全局包是按 Node 版本走的，base 里装的 Node 给 venv 里用一般也 OK，但保险起见每个 env 各装一份

---

### 十、决策树（给未来的自己）

```
我要在 JupyterLab 里用 AI 写 notebook
│
├─ 我已经习惯在 Claude Code 终端里干活
│   └─→ 用 Datalayer jupyter-mcp-server，不用 jupyter-ai
│
├─ 我大部分时间在 JupyterLab UI 里，想要聊天驱动
│   └─→ jupyter-ai v3 + Claude Code adapter ✅ (本笔记的路线)
│
├─ 我要 GitHub Copilot 那种 ghost text 边敲边补
│   └─→ NBI (notebook-intelligence)
│
└─ 我只想偶尔用 %%ai 在 cell 里调一下 LLM
    └─→ pip install jupyter-ai-magics (轻量，无需 v3 全套)
```

---

### 参考

- 官方 Quickstart: <https://jupyter-ai.readthedocs.io/en/v3/getting-started.html>
- v3 Release Issue: <https://github.com/jupyterlab/jupyter-ai/issues/1531>
- ACP 协议: <https://agentclientprotocol.com>
- Claude Code ACP adapter: `@agentclientprotocol/claude-agent-acp` (npm)
- Jupyter MCP Server (独立版): <https://github.com/datalayer/jupyter-mcp-server>
