# Obsidian Jupyter Lab 启动按钮 — 插件设计文档

## 一、需求概述

为 Obsidian 设计一个按钮，按下后自动完成以下流程：

1. 检测/启动本地 Jupyter Lab 进程
2. 在 Jupyter Lab 中打开 Obsidian 当前活动文件

本质是一个 Obsidian 插件，需要打通 Obsidian 与本地 Jupyter Lab 进程之间的通信。

## 二、核心思路

整个流程拆成三步：

1. **定位当前文件** —— 通过 Obsidian API 获取活动文件路径
2. **保证 Jupyter Lab 在运行** —— 检测端口，未运行则 spawn 子进程
3. **打开文件** —— 拼接带 token 的 Jupyter URL，调用系统默认浏览器

难点集中在第二步:Jupyter 是外部进程,需要管理其生命周期,并取得 token 才能构造可访问的 URL。

## 三、插件结构

### 3.1 UI 入口

提供三个触发入口,覆盖不同使用习惯:

- **Ribbon 按钮**:左侧栏放一个 Jupyter 图标,点击触发主流程
- **Command**:注册 `Open in Jupyter Lab` 命令,用户可绑定快捷键(推荐 `Ctrl+Shift+J`)
- **File menu**:右键菜单加一项,针对 `.ipynb` 和 `.md` 文件显示

### 3.2 设置页

需要暴露的配置项:

- Jupyter 可执行文件路径(默认 `jupyter`,支持自定义绝对路径或 conda 环境)
- 监听端口(默认 8888)
- 工作目录(默认 vault 根目录)
- 是否启用 jupytext 把 `.md` 当 notebook 打开
- 自定义启动参数(透传给 `jupyter lab`)
- 固定 token(可选,设置后启动时复用)

## 四、进程管理

这是整个插件最关键的部分。Obsidian 桌面端基于 Electron,可直接使用 Node.js 的 `child_process`。

```typescript
import { spawn, ChildProcess } from 'child_process';

class JupyterManager {
  private process: ChildProcess | null = null;
  private token: string | null = null;
  private port: number = 8888;

  async ensureRunning(cwd: string): Promise<{url: string, token: string}> {
    // 1. 先探测端口是否已有 Jupyter 在跑
    if (await this.isAlive()) {
      return { url: `http://localhost:${this.port}`, token: this.token! };
    }

    // 2. spawn 进程,--no-browser 防止它自己开浏览器
    this.process = spawn('jupyter', [
      'lab',
      '--no-browser',
      `--port=${this.port}`,
      '--ServerApp.token=...'
    ], { cwd, detached: false });

    // 3. 监听 stderr,从 "http://localhost:8888/lab?token=xxx" 抓 token
    return new Promise((resolve) => {
      this.process!.stderr?.on('data', (data) => {
        const match = data.toString().match(/token=([a-f0-9]+)/);
        if (match) {
          this.token = match[1];
          resolve({ url: `http://localhost:${this.port}`, token: this.token });
        }
      });
    });
  }
}
```

### 4.1 Token 管理建议

推荐 **启动时预设一个固定 token**(通过 `--ServerApp.token=<自定义>` 传入)。好处:

- 省去解析 stderr 的麻烦
- 多次启动之间保持一致
- 用户可以选择把这个 token 存到设置里复用

## 五、URL 拼接与文件打开

Jupyter Lab 的文件路由格式:

```
http://localhost:8888/lab/tree/<相对路径>?token=<token>
```

相对路径是 **相对于 Jupyter 启动时的 cwd**。因此 **让 Jupyter 从 vault 根目录启动** 是最干净的做法 —— Obsidian 的 `getActiveFile().path` 拿到的就是可直接拼接的相对路径。

```typescript
const file = this.app.workspace.getActiveFile();
const vaultPath = (this.app.vault.adapter as any).basePath;
const { url, token } = await jupyter.ensureRunning(vaultPath);
const fileUrl = `${url}/lab/tree/${encodeURI(file.path)}?token=${token}`;
window.open(fileUrl);
```

## 六、Markdown 文件的处理

Obsidian 主要处理 `.md`,但 Jupyter Lab 默认不把 `.md` 当 notebook 打开。两个方案:

| 方案 | 优点 | 缺点 |
|------|------|------|
| 依赖 jupytext | 体验直观,符合 Obsidian 用户群 | 需要用户在 Jupyter 端装 jupytext |
| 只支持 .ipynb | 简单可靠 | 在 .md 上按钮置灰,功能受限 |

推荐 **方案 1**。安装 jupytext 后,可以通过 URL 直接以 notebook 视图打开:

```
/lab/tree/note.md?factory=Notebook
```

需要在文档中明确说明 jupytext 是可选依赖。

## 七、潜在问题与对策

### 7.1 进程清理

插件 `onunload` 时是否 kill Jupyter?

**建议:不杀**。用户可能还在用 Jupyter,直接终止体验差。改为提供一个独立的 `Stop Jupyter Server` 命令,让用户主动控制。

### 7.2 端口冲突

端口被占用时,两种处理:

- 自动尝试 `port + 1`,逐个递增直到成功
- 直接报错并提示用户在设置中修改

建议先尝试递增 5 次,失败后再报错。

### 7.3 Windows 路径

Windows 下 `spawn` 需要注意:

- 用 `shell: true`,或直接调用 `jupyter.exe`
- 路径分隔符要处理(可用 `path.posix` 拼 URL)

### 7.4 移动端

Obsidian mobile 没有 Node.js,无法 spawn 子进程。在 `manifest.json` 中设置:

```json
{
  "isDesktopOnly": true
}
```

## 八、最小可行版本(MVP)的功能边界

第一版只做以下功能,其余迭代:

- ✅ Ribbon 按钮 + Command
- ✅ 自动启动 Jupyter Lab(固定 token)
- ✅ 打开当前 `.ipynb` 文件
- ✅ 简单的设置页(路径、端口、token)
- ⏳ jupytext 集成(v0.2)
- ⏳ 多 vault / 多端口管理(v0.3)
- ⏳ 状态栏显示 Jupyter 运行状态(v0.3)

## 九、文件结构建议

```
obsidian-jupyter-launcher/
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── src/
│   ├── main.ts              # 插件入口
│   ├── jupyter-manager.ts   # 进程管理
│   ├── settings.ts          # 设置页
│   └── url-builder.ts       # URL 拼接逻辑
└── README.md
```

## 十、下一步

可以基于本设计直接产出:

1. `main.ts` + `manifest.json` 的最小可运行骨架
2. 跑通主路径:ribbon 按钮 → 启动 Jupyter → 打开当前 `.ipynb`
3. 在本地 vault 中验证

后续再根据实际使用迭代设置项与 jupytext 支持。
