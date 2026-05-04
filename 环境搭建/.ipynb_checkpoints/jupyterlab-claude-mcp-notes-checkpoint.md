# JupyterLab、Notebook Intelligence 与 Claude MCP 配置笔记

## 结论摘要

如果 PowerShell 里已经安装了 Node.js，再执行：

```powershell
conda activate base
conda install nodejs
```

会在 conda 的 `base` 环境里再安装一份 Node.js。它不会覆盖系统 Node.js，但 `conda activate base` 后，PATH 通常会优先解析 conda 环境里的 `node` 和 `npm`。

`notebook-intelligence` 和 Datalayer 的 `jupyter-mcp-server` 不冲突，可以都安装在同一个 conda `base` 环境中。两者角色不同：

```text
notebook-intelligence
= JupyterLab 扩展
= 在 JupyterLab UI 里提供 AI assistant / Claude Mode

datalayer/jupyter-mcp-server
= 标准 MCP server
= 让 Claude Desktop / Claude Code / Cursor 等外部 MCP client 控制 JupyterLab / notebook
```

## Claude Code 是否必须装在 conda 环境里

不必须。Notebook Intelligence 的 Claude Mode 关键是 JupyterLab 启动进程能找到 `claude` 命令。

检查命令：

```powershell
conda activate base
where.exe node
where.exe npm
where.exe claude
claude --version
```

如果 `conda activate base` 后找不到 `claude`，说明 conda 激活后的 PATH 没有包含系统 npm 全局目录。可选方案：

```text
1. 不在 conda 里装 Node，只修 PATH，让 JupyterLab 能找到系统 claude.cmd
2. 在 conda base 里装 Node，然后 npm install -g @anthropic-ai/claude-code
```

## Notebook Intelligence 的 MCP 边界

Notebook Intelligence 不是把自己的 Jupyter 控制能力暴露成一个独立 MCP server 给 Claude Desktop。

更准确的方向是：

```text
JupyterLab / Notebook Intelligence
        -> 调用 Claude Code
        -> 复用 Claude Code 的 MCP / skills / tools
```

不是：

```text
Claude Desktop
        -> 连接 Notebook Intelligence MCP
        -> 控制 JupyterLab
```

NBI 的 `Jupyter UI tools` 看起来是 JupyterLab 内部工具，不是可直接添加到 Claude Desktop 的标准 MCP server。

## 可直接给 JupyterLab 用的 MCP

推荐优先使用 Datalayer 的 `jupyter-mcp-server`：

```text
https://github.com/datalayer/jupyter-mcp-server
```

它支持：

```text
- list_files
- list_kernels
- use_notebook
- list_notebooks
- read_notebook
- read_cell
- insert_cell
- delete_cell
- overwrite_cell_source
- execute_cell
- insert_execute_code_cell
- execute_code
- notebook_run-all-cells
- notebook_get-selected-cell
```

## 安装建议

在 conda `base` 环境里安装 JupyterLab、Notebook Intelligence 和 Jupyter MCP 依赖：

```powershell
conda activate base
pip install jupyterlab notebook-intelligence
pip install jupyter-collaboration jupyter-mcp-tools ipykernel pycrdt uv
```

如果需要 Claude Code 也绑定在 conda 环境里：

```powershell
conda activate base
conda install nodejs
npm install -g @anthropic-ai/claude-code
```

如果已经用系统 Node.js 安装了 Claude Code，并且 conda 环境里能找到 `claude`，就不一定需要重复安装。

## JupyterLab token 是什么

启动命令：

```powershell
jupyter lab --port 8888 --IdentityProvider.token MY_TOKEN
```

这里的 `MY_TOKEN` 是 JupyterLab 的访问令牌，相当于本地 JupyterLab 登录密码之一。它只是占位符，可以换成自己的固定字符串，例如：

```powershell
jupyter lab --port 8888 --IdentityProvider.token jupyter-mcp-local
```

浏览器登录页输入：

```text
jupyter-mcp-local
```

Claude Desktop MCP 配置里也要使用同一个 token：

```json
"JUPYTER_TOKEN": "jupyter-mcp-local"
```

如果不带 token 启动：

```powershell
jupyter lab --port 8888
```

Jupyter 通常会自动生成临时 token，并在终端输出类似：

```text
http://localhost:8888/lab?token=...
```

这种方式可以接 MCP，但每次 token 变化后都要更新 Claude Desktop 配置，不方便。

## 固定 JupyterLab 默认 token

生成 Jupyter Server 配置：

```powershell
jupyter server --generate-config
```

配置文件路径通常是：

```text
C:\Users\user\.jupyter\jupyter_server_config.py
```

加入：

```python
c.IdentityProvider.token = "jupyter-mcp-local"
c.ServerApp.port = 8888
```

之后即使只运行：

```powershell
jupyter lab
```

也会默认使用固定 token：

```text
jupyter-mcp-local
```

注意：如果启动时命令行又传入别的 token，例如：

```powershell
jupyter lab --IdentityProvider.token abc123
```

命令行参数会覆盖配置文件。

也可以使用 JSON 配置：

```text
C:\Users\user\.jupyter\jupyter_server_config.json
```

内容：

```json
{
  "IdentityProvider": {
    "token": "jupyter-mcp-local"
  },
  "ServerApp": {
    "port": 8888
  }
}
```

## Claude Desktop 接入 Jupyter MCP

Claude Desktop 不会自动扫描本机 MCP server。需要显式配置 MCP server。

Claude Desktop 配置文件路径：

```text
%APPDATA%\Claude\claude_desktop_config.json
```

推荐配置：

```json
{
  "mcpServers": {
    "jupyter": {
      "command": "uvx",
      "args": ["jupyter-mcp-server@latest"],
      "env": {
        "JUPYTER_URL": "http://localhost:8888",
        "JUPYTER_TOKEN": "jupyter-mcp-local",
        "ALLOW_IMG_OUTPUT": "true"
      }
    }
  }
}
```

然后启动 JupyterLab：

```powershell
jupyter lab
```

或显式启动：

```powershell
jupyter lab --port 8888 --IdentityProvider.token jupyter-mcp-local
```

保存配置后，重启 Claude Desktop。

## 是否有一键安装 Jupyter MCP Server 扩展

Claude Desktop 有 Extensions / MCPB 机制，可以通过扩展方式安装某些 MCP server。

但就 Datalayer 的 `jupyter-mcp-server` 来说，目前看到的官方 Claude Desktop 接入方式主要还是编辑：

```text
claude_desktop_config.json
```

没有看到 Claude Desktop 官方内置的“一键安装 Datalayer Jupyter MCP Server 扩展”入口。

如果扩展目录里有 Jupyter MCP 相关扩展，可以通过：

```text
Claude Desktop -> Settings -> Extensions -> Browse extensions
```

安装，然后在扩展设置里填：

```text
JUPYTER_URL = http://localhost:8888
JUPYTER_TOKEN = jupyter-mcp-local
```

如果没有现成 `.mcpb`，就继续使用 `claude_desktop_config.json` 手动配置。手动配置一次后，只要 JupyterLab token 固定，之后不需要每次修改。

## 推荐日常启动流程

一次性配置：

```powershell
jupyter server --generate-config
```

在 `C:\Users\user\.jupyter\jupyter_server_config.py` 写入：

```python
c.IdentityProvider.token = "jupyter-mcp-local"
c.ServerApp.port = 8888
```

Claude Desktop 的 `claude_desktop_config.json` 固定写：

```json
{
  "mcpServers": {
    "jupyter": {
      "command": "uvx",
      "args": ["jupyter-mcp-server@latest"],
      "env": {
        "JUPYTER_URL": "http://localhost:8888",
        "JUPYTER_TOKEN": "jupyter-mcp-local",
        "ALLOW_IMG_OUTPUT": "true"
      }
    }
  }
}
```

日常启动：

```powershell
conda activate base
jupyter lab
```

然后打开 Claude Desktop，MCP 会通过固定 URL 和 token 连接到 JupyterLab。

## Claude Desktop 在 conda 外，MCP 在 base 里是否可以

可以。Claude Desktop 可以安装在 conda 环境之外，JupyterLab 和 Datalayer `jupyter-mcp-server` 可以安装在 conda `base` 环境里。它们不需要处在同一个 Python/Node 环境。

关键点是：Claude Desktop 启动 MCP server 时，必须能找到 MCP server 的启动命令。

如果配置写成：

```json
{
  "mcpServers": {
    "jupyter": {
      "command": "uvx",
      "args": ["jupyter-mcp-server@latest"],
      "env": {
        "JUPYTER_URL": "http://localhost:8888",
        "JUPYTER_TOKEN": "jupyter-mcp-local",
        "ALLOW_IMG_OUTPUT": "true"
      }
    }
  }
}
```

Claude Desktop 会在自己的系统 PATH 里找 `uvx`。如果 `uvx` 只安装在 conda `base` 环境里，而 Claude Desktop 没有继承 conda 的 PATH，就可能找不到。

更稳的方式是写 `uvx.exe` 的绝对路径。

查询路径：

```powershell
conda activate base
where.exe uvx
where.exe python
```

Anaconda 常见路径：

```text
C:\Users\user\anaconda3\Scripts\uvx.exe
```

Miniconda 常见路径：

```text
C:\Users\user\miniconda3\Scripts\uvx.exe
```

Claude Desktop 配置示例：

```json
{
  "mcpServers": {
    "jupyter": {
      "command": "C:\\Users\\user\\anaconda3\\Scripts\\uvx.exe",
      "args": ["jupyter-mcp-server@latest"],
      "env": {
        "JUPYTER_URL": "http://localhost:8888",
        "JUPYTER_TOKEN": "jupyter-mcp-local",
        "ALLOW_IMG_OUTPUT": "true"
      }
    }
  }
}
```

如果实际是 Miniconda，把路径改成：

```text
C:\Users\user\miniconda3\Scripts\uvx.exe
```

JupyterLab 仍然需要先启动：

```powershell
conda activate base
jupyter lab
```

Claude Desktop 的 MCP server 只是连接：

```text
http://localhost:8888
```

它不会自动替你启动 JupyterLab。

## 为什么 Datalayer MCP 推荐通过 uvx 启动

`uvx` 不是 Datalayer MCP 的硬性要求，它是官方文档推荐的快速启动方式。

它的作用类似 Python 生态里的 `npx`：

```powershell
uvx jupyter-mcp-server@latest
```

会临时解析、安装并运行 PyPI 上的 `jupyter-mcp-server`。Claude Desktop 每次启动 MCP 时，就可以直接拉起这个 server。

优点：

```text
- 不需要手动 clone repo
- 不需要手动管理 venv
- 不一定需要先 pip install jupyter-mcp-server
- 配置短
- 跨环境相对简单
```

缺点：

```text
- Claude Desktop 必须找得到 uvx
- 首次运行可能需要联网下载
- 使用 @latest 时版本可能变化
- 如果 uvx 装在 conda base，而 Claude Desktop 不继承 conda PATH，可能找不到
```

也可以不用 `uvx`。

方式 1：固定安装后直接用入口命令：

```json
{
  "mcpServers": {
    "jupyter": {
      "command": "C:\\Users\\user\\anaconda3\\Scripts\\jupyter-mcp-server.exe",
      "args": [],
      "env": {
        "JUPYTER_URL": "http://localhost:8888",
        "JUPYTER_TOKEN": "jupyter-mcp-local",
        "ALLOW_IMG_OUTPUT": "true"
      }
    }
  }
}
```

方式 2：用 Docker：

```json
{
  "mcpServers": {
    "jupyter": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "JUPYTER_URL",
        "-e", "JUPYTER_TOKEN",
        "-e", "ALLOW_IMG_OUTPUT",
        "datalayer/jupyter-mcp-server:latest"
      ],
      "env": {
        "JUPYTER_URL": "http://host.docker.internal:8888",
        "JUPYTER_TOKEN": "jupyter-mcp-local",
        "ALLOW_IMG_OUTPUT": "true"
      }
    }
  }
}
```

方式 3：继续用 `uvx`，但写绝对路径：

```json
{
  "mcpServers": {
    "jupyter": {
      "command": "C:\\Users\\user\\anaconda3\\Scripts\\uvx.exe",
      "args": ["jupyter-mcp-server@latest"],
      "env": {
        "JUPYTER_URL": "http://localhost:8888",
        "JUPYTER_TOKEN": "jupyter-mcp-local",
        "ALLOW_IMG_OUTPUT": "true"
      }
    }
  }
}
```

Windows + conda 场景下，推荐方式 3：继续用 `uvx`，但不要写裸命令 `"uvx"`，而是写绝对路径。

## 使用 uvx 后 JupyterLab 启动脚本如何变化

如果使用 `uvx`，JupyterLab 的启动脚本基本不需要因为 MCP server 改动。

`uvx` 是 Claude Desktop 用来启动 `jupyter-mcp-server` 的。JupyterLab 启动脚本只需要保证：

```text
1. JupyterLab 跑在固定端口，例如 8888
2. token 固定，例如 jupyter-mcp-local
3. 已安装 JupyterLab / collaboration / jupyter-mcp-tools 等依赖
```

推荐日常脚本：

```powershell
conda activate base
jupyter lab --port 8888 --IdentityProvider.token jupyter-mcp-local
```

如果已经把 token 和 port 写进：

```text
C:\Users\user\.jupyter\jupyter_server_config.py
```

例如：

```python
c.IdentityProvider.token = "jupyter-mcp-local"
c.ServerApp.port = 8888
```

那脚本可以简化成：

```powershell
conda activate base
jupyter lab
```

Claude Desktop 配置固定一次：

```json
{
  "mcpServers": {
    "jupyter": {
      "command": "C:\\Users\\user\\anaconda3\\Scripts\\uvx.exe",
      "args": ["jupyter-mcp-server@latest"],
      "env": {
        "JUPYTER_URL": "http://localhost:8888",
        "JUPYTER_TOKEN": "jupyter-mcp-local",
        "ALLOW_IMG_OUTPUT": "true"
      }
    }
  }
}
```

整体关系：

```text
手动启动：
conda base -> jupyter lab -> http://localhost:8888

Claude Desktop 自动启动：
uvx -> jupyter-mcp-server -> 连接 http://localhost:8888
```

所以 JupyterLab 启动脚本不需要启动 `uvx`，也不需要启动 `jupyter-mcp-server`。Claude Desktop 会在需要 MCP 时自己启动它。

## 注意事项

不要同时让多个 agent 修改同一个 notebook。技术上 NBI、Claude Desktop MCP、Claude Code 可以共存，但如果它们同时操作同一个 `.ipynb`，可能出现内容互相覆盖或执行状态混乱。

不建议完全禁用 Jupyter token，尤其不要在禁用 token 的情况下使用：

```powershell
--ip 0.0.0.0
```

这会增加局域网访问风险。

## 参考链接

- Datalayer Jupyter MCP Server: https://github.com/datalayer/jupyter-mcp-server
- Jupyter MCP Server docs: https://jupyter-mcp-server.datalayer.tech/
- Notebook Intelligence PyPI: https://pypi.org/project/notebook-intelligence/
- Jupyter Server configuration: https://jupyter-server.readthedocs.io/en/stable/users/configuration.html
- Claude Desktop local MCP servers: https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop
- Claude Desktop Extensions / MCPB: https://claude.com/docs/connectors/building/mcpb
