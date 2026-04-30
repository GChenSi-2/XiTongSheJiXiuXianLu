## Obsidian Jupyter Lab Launcher — 实现笔记

> 配套设计文档：[[obsidian-jupyter-plugin-design.md]]
> 启动脚本参考：[[通过anaconda启动JupyterLab.bat]]

记录把设计文档落到 v0.1 可用插件的过程，重点是几个 **如果重写一次还是会这么做** 的关键决策、和被坑过一遍才知道答案的小细节。

### 一、最终交付物

```
.obsidian/plugins/obsidian-jupyter-launcher/
├── manifest.json       # id / name / minAppVersion / isDesktopOnly
├── main.js             # 单文件，约 600 行原生 JS
└── styles.css          # 状态栏样式
```

外加两处配置改动：

- `.obsidian/community-plugins.json` 末尾追加 `"obsidian-jupyter-launcher"`（启用插件）
- `.obsidian/plugins/obsidian-icon-folder/data.json` 给设计文档配 `LiNotebookPen` 图标

### 二、为什么不上 TypeScript / Esbuild

业界标准 Obsidian 插件模板是 TypeScript + esbuild bundle 出 `main.js`。我这次故意不走这条路：

| 维度   | TS + bundle        | 直接写 main.js |
| ---- | ------------------ | ----------- |
| 类型检查 | ✅                  | ❌（手核 API）   |
| 调试改动 | 改 → build → reload | 改 → reload  |
| 用户审计 | bundle 后不可读        | 可逐行看        |
| 工程规模 | 适合大型插件             | 600 行刚好     |

代价：失去类型校验。我用 `node --check` + 手动核对 `obsidian` 命名空间常用 API（`Plugin`、`Notice`、`Setting`、`PluginSettingTab`、`TFile`、`addRibbonIcon`、`addCommand`、`addStatusBarItem`）来兜底。

### 三、整体流程

```
用户点 ribbon
    │
    ▼
plugin.launch(file?)
    │
    ▼
manager.ensureRunning()  ──► 已运行？是 ─► 复用
    │ 否
    ▼
generateToken() / 找空闲端口
    │
    ▼
_spawnJupyter()  ──► 直接 spawn jupyter.exe（干净）
    │              ╲ 找不到 exe ─► cmd.exe /c "call activate.bat && jupyter.exe ..."
    ▼
轮询 /api 直到 200/401/403（最多 30s）
    │
    ▼
plugin.buildFileUrl(file) → window.open(url)
```

### 四、关键模块：JupyterManager

整个插件的工程难点都集中在这个类：进程要不要在跑、跑没跑起来、怎么干净地杀。

#### 4.1 状态字段

```javascript
class JupyterManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.process = null;        // ChildProcess | null
    this.token = null;          // 当前 server 的 token
    this.port = null;           // 实际监听的端口
    this.startingPromise = null; // 启动中的 Promise，用于并发合并
  }
}
```

`startingPromise` 是个反复证明有用的小字段：用户连点两下 ribbon 时，不能让我们启动两个 jupyter。

```javascript
async ensureRunning() {
  // 已活跃直接复用
  if (this.process && this.token && this.port && await this.isAlive(this.port)) {
    return { url: `http://localhost:${this.port}`, token: this.token, port: this.port };
  }
  // 启动中复用同一个 Promise
  if (this.startingPromise) return this.startingPromise;

  this.startingPromise = this._startNew().finally(() => {
    this.startingPromise = null;
  });
  return this.startingPromise;
}
```

#### 4.2 端口探测：isAlive

```javascript
isAlive(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: '127.0.0.1', port, path: '/api', timeout: 1500 },
      (res) => { resolve(res.statusCode > 0); res.resume(); }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}
```

**关键点**：`/api` 返回 401/403 也算 alive。因为我们没带 token 时 jupyter 会拒绝，但拒绝得回响应——能响应就说明服务在。如果只认 200，会把 "在跑但拒绝匿名访问" 误判成挂了。

#### 4.3 启动方式：三选一中选了「直接 Spawn exe」

设计文档建议照着 `.bat` 文件走——`call activate.bat` 然后 `jupyter.exe lab`。这条路最直观，但实现起来有三个问题：

1. **多一层 cmd.exe**：进程树变深，杀的时候要 `taskkill /t`
2. **引号转义**：`spawn('cmd.exe', ['/c', cmdString])` 时，cmdString 里的路径（带空格）+ 参数（带 `=`）混合出非常微妙的转义需求
3. **stderr 噪声**：activate.bat 自己有输出，混在 jupyter 的 stderr 里

所以我做了一个 **决策树**：

```javascript
_spawnJupyter(settings, args, workDir) {
  const customExe = (settings.jupyterExecutable || '').trim();

  // 优先级 1：用户显式指定的 exe 路径
  if (customExe && fs.existsSync(customExe)) {
    return spawn(customExe, args, { cwd: workDir, windowsHide: true });
  }

  // 优先级 2：从 condaActivatePath + condaEnv 推导出 exe 路径
  const derived = this.deriveJupyterExe(settings);
  if (fs.existsSync(derived)) {
    return spawn(derived, args, { cwd: workDir, windowsHide: true });
  }

  // 优先级 3（回退）：cmd.exe + activate.bat
  const fullCmd = `call "${activate}" "${env}" && jupyter.exe ${argStr}`;
  return spawn('cmd.exe', ['/d', '/s', '/c', fullCmd], {
    cwd: workDir, windowsHide: true,
  });
}
```

90% 的情况都会走优先级 2，干净地直接调用 exe，没有 shell 中间层。

#### 4.4 路径推导：从 activate.bat 倒推 jupyter.exe

```
condaActivatePath = C:\Users\user\anaconda3\Scripts\activate.bat
                    └────── condaRoot ──────┘└─ Scripts ─┘└── activate.bat ──┘
```

```javascript
deriveJupyterExe(settings) {
  const scriptsDir = path.dirname(activate);     // ...\anaconda3\Scripts
  const condaRoot = path.dirname(scriptsDir);     // ...\anaconda3
  const env = (settings.condaEnv || 'base').trim();
  if (env === 'base' || env === '') {
    return path.join(condaRoot, 'Scripts', 'jupyter.exe');
  }
  return path.join(condaRoot, 'envs', env, 'Scripts', 'jupyter.exe');
}
```

为什么不直接调用 `jupyter.exe`（依赖 PATH）？因为 PATH 里可能有多个 Python 环境，调错环境会非常难排查。**绝对路径 = 显式 = 可调试**。

#### 4.5 启动参数

```javascript
const args = [
  'lab',
  '--no-browser',                                  // 关键：别让 jupyter 自己开浏览器
  `--port=${port}`,
  '--ServerApp.open_browser=False',                // 双保险
  `--ServerApp.token=${token}`,                    // 预设 token，省去 stderr 解析
  '--ServerApp.password=',                         // 显式置空，别让它读旧 config
  `--ServerApp.root_dir=${workDir}`,
];
```

设计文档里讨论过两种 token 方案：解析 stderr 抓 token，或者预设固定 token。我直接选预设——`--ServerApp.token=<我们生成的>`，省掉一整套 stderr 监听 + 正则匹配的代码。

#### 4.6 进程清理：taskkill /t /f

```javascript
_killChild(child) {
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
  } else {
    child.kill();
  }
}
```

这是 Windows 上的 **必修课**。`child.kill()` 只杀直接子进程（cmd.exe 或 jupyter.exe launcher），下面的孙子进程（python.exe）会变孤儿，端口仍然被占用，下次启动时找不到自己留下的旧 server。

`/t` = tree（杀整棵子进程树），`/f` = force。两个 flag 缺一不可。

#### 4.7 Onunload 默不默杀？

设计文档明确：**插件 disable 时不杀 jupyter**，理由是用户可能正在用浏览器里那个 lab。我加了 `autoStopOnUnload` 设置项让用户自己选，默认 `false`：

```javascript
async onunload() {
  if (this.settings && this.settings.autoStopOnUnload && this.manager) {
    try { await this.manager.stop(); } catch (_) { /* ignore */ }
  }
}
```

注意：`onunload` 触发时机是 **插件禁用 / 卸载 / Obsidian 关闭**。Obsidian 整体关闭时，OS 会自动清理子进程（除非 spawn 时用了 `detached: true`）。我没用 detached，所以这部分由 OS 兜底。

### 五、URL 拼接

```javascript
buildFileUrl(file) {
  const ext = (file.extension || '').toLowerCase();
  const useFactory = ext === 'md' && this.settings.useJupytext;
  const base = `http://localhost:${this.manager.port}/lab/tree/${this.encodePath(file.path)}`;
  const params = [`token=${encodeURIComponent(this.manager.token)}`];
  if (useFactory) params.push('factory=Notebook');
  return `${base}?${params.join('&')}`;
}

encodePath(p) {
  // Obsidian 的 file.path 总是用 / 分隔
  return p.split('/').map(encodeURIComponent).join('/');
}
```

**易踩点**：不能整体 `encodeURIComponent(file.path)`，否则 `/` 会变成 `%2F`，jupyter 就把路径当成单个文件名了。必须**按段编码再用 `/` 拼回去**。

`.md` 通过 jupytext 走 `?factory=Notebook`，效果是 lab 把 .md 当 notebook 视图打开（前提：用户已 `pip install jupytext`）。

### 六、UI 接入：四个入口

| 入口        | 实现                                                        | 触发什么                |
| --------- | --------------------------------------------------------- | ------------------- |
| Ribbon 按钮 | `addRibbonIcon('notebook-pen', …)`                      | `launch()` 当前文件     |
| 命令面板      | 5 条 `addCommand`：open / start / stop / restart / copy URL | 各自语义                |
| 文件右键菜单    | `workspace.on('file-menu', …)` 过滤扩展名                    | `launch(file)` 指定文件 |
| 状态栏       | `addStatusBarItem()` + click 监听                           | 未运行→启动；运行中→复制 URL   |

文件右键菜单的过滤逻辑：

```javascript
this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
  if (!(file instanceof obsidian.TFile)) return;
  const ext = file.extension.toLowerCase();
  const ok = ext === 'ipynb' || (ext === 'md' && this.settings.useJupytext);
  if (!ok) return;
  menu.addItem(item => {
    item.setTitle('在 Jupyter Lab 中打开').setIcon('notebook-pen').onClick(() => this.launch(file));
  });
}));
```

注意 `if (!ok) return` 而不是把整个 menu.addItem 放进 if——这样可以让代码线性读下去。

### 七、设置页

```javascript
class JupyterLauncherSettingTab extends obsidian.PluginSettingTab {
  display() {
    new obsidian.Setting(containerEl)
      .setName('Conda activate.bat 路径')
      .setDesc('...')
      .addText(text => text
        .setPlaceholder('C:\\Users\\<user>\\anaconda3\\Scripts\\activate.bat')
        .setValue(this.plugin.settings.condaActivatePath)
        .onChange(async (val) => {
          this.plugin.settings.condaActivatePath = val.trim();
          await this.plugin.saveSettings();
        }));
    // ... 其余 9 项类似
  }
}
```

每个 `Setting` 对象都是 fluent API：`.setName().setDesc().addText/addToggle/addButton(…)`。`onChange` 内部立刻调 `saveSettings()`，无需「保存」按钮。

底部加了一个 **操作区**，三个按钮（启动 / 停止 / 复制 URL），方便不去 ribbon 也能调试：

```javascript
new obsidian.Setting(containerEl)
  .setName('当前状态')
  .setDesc(this.plugin.manager.isRunning() ? `运行中（port ${this.plugin.manager.port}）` : '未运行')
  .addButton(btn => btn.setButtonText('启动').onClick(async () => {
    await this.plugin.startOnly();
    this.display();  // 重绘整个 tab，刷新状态描述
  }))
  // ...
```

### 八、状态栏：小成本大体验

```javascript
this.statusBarEl = this.addStatusBarItem();
this.statusBarEl.addEventListener('click', () => {
  if (this.manager.isRunning()) {
    this.copyUrl();
  } else {
    this.startOnly();
  }
});
```

状态栏文字两态：`Jupyter ● :8888`（运行）/ `Jupyter ○`（未运行）。配合 styles.css 用主题变量上色：

```css
.jupyter-launcher-status.is-running { color: var(--color-green); }
.jupyter-launcher-status.is-stopped { color: var(--text-muted); }
```

### 九、踩坑记录

#### 9.1 Windows 引号转义（cmd.exe 回退路径）

走 cmd.exe 时，命令字符串需要嵌入活动 bat 路径（含空格）+ 多个 jupyter 参数。我的策略：

```javascript
const argStr = args
  .map(a => /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)
  .join(' ');
const fullCmd = `call "${activate}" "${env}" && jupyter.exe ${argStr}`;

spawn('cmd.exe', ['/d', '/s', '/c', fullCmd], { windowsVerbatimArguments: false });
```

- `windowsVerbatimArguments: false`：让 Node 处理外层（把 `fullCmd` 作为 cmd.exe 的一个参数正确转义）
- 内部参数自己加双引号 + 转义内嵌引号
- `cmd /d /s /c "…"`：`/d` 跳过 AutoRun、`/s` 让 cmd 不剥离最外层引号

#### 9.2 workDir 末尾的反斜杠陷阱

```javascript
workDir = workDir.replace(/[\\/]+$/, '');
```

如果 workDir 末尾有 `\`，进 spawn 后会变成 `--ServerApp.root_dir=C:\path\` → Windows 命令行被序列化成 `"--ServerApp.root_dir=C:\path\"` → CRT 把 `\"` 看作转义引号 → 整个参数解析错位。**统一去掉末尾分隔符**，避免这一类边界 case。

#### 9.3 进程退出后状态没清

```javascript
child.on('exit', (code, signal) => {
  this.log('exit', `Jupyter exited (code=${code}, signal=${signal})`);
  if (this.process === child) {
    this.process = null;
    this.token = null;
    this.port = null;
    this.plugin.updateStatus();
  }
});
```

`this.process === child` 这个判断很关键：避免「stop 之后又 start，老 child 触发 exit 把新 child 的状态清掉」这种竞争。每个 child 只敢清自己的字段。

#### 9.4 启动超时怎么算

我把超时逻辑放在轮询循环里：

```javascript
const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  if (this.process !== child) throw new Error('Jupyter 启动过程中被中断');
  if (await this.isAlive(port)) return { url, token, port };
  await sleep(500);
}
// 超时：清理 child，抛错
```

500ms 一轮，30s 上限，期间如果用户按了 stop 导致 `this.process` 被换掉，我会立刻抛"被中断"。这比单纯 `setTimeout` 健壮。

#### 9.5 isAlive 探测端口冲突时的歧义

启动前的端口检查：

```javascript
for (let i = 0; i < maxRetries; i++) {
  const candidate = startPort + i;
  if (!(await this.isAlive(candidate))) { port = candidate; break; }
}
```

注意：这里用 `isAlive` 当作 "端口被占用" 的判定，但更准确说是 "端口上有 HTTP 服务"。如果端口被非 HTTP 程序占用，`isAlive` 返回 `false`，我们会尝试 bind，然后 jupyter 自己会报 EADDRINUSE。这是已知不完美——但用 `net.createServer().listen()` 实际占一下来检测，又会引入「测了一下，松开端口的瞬间被别人抢了」的竞态。Trade-off 之下选了 HTTP 探测。

### 十、与设计文档的对照

| 设计文档项                 | v0.1 状态               |
| --------------------- | --------------------- |
| Ribbon 按钮             | ✅                     |
| Command（含快捷键支持）       | ✅ 5 条命令               |
| File menu             | ✅                     |
| 进程管理 / token 预设       | ✅                     |
| URL 拼接 + .md jupytext | ✅ `?factory=Notebook` |
| 端口冲突自动 +1             | ✅ portRetries=5       |
| `isDesktopOnly: true` | ✅                     |
| 设置页                   | ✅ 含调试按钮               |
| 状态栏                   | ✅（设计文档原计划 v0.3）       |
| 多 vault / 多端口         | ⏳                     |
| jupytext 集成（自动安装/检测）  | ⏳ 仅 URL 层支持           |

### 十一、可改进点

1. **健康检查可以更聪明**：现在只 GET /api，可以追加 `Authorization: token <我们的token>` 验证 server 真的是我们启的（防止 token 被改之类）
2. **stderr 解析做兜底**：万一 `--ServerApp.token` 因为 jupyter 升级行为变化失效，可以从 stderr 抓 token 兜底
3. **Linux/macOS 支持**：现在 `taskkill` 是 Windows 专用，POSIX 上需要 `kill -TERM` + `process.kill(-pid)`（杀进程组），需要 spawn 时加 `detached: true` 来形成进程组
4. **多端口管理**：用户在两个 vault 同时打开 jupyter 时，第二个 vault 应该跑在不同端口，并各自管理状态
5. **失败诊断**：spawn 失败 / jupyter 启动失败时，在 Notice 里提供 "查看日志" 链接直接打开 DevTools

### 十二、调试小贴士

1. **DevTools 打开**：`Ctrl+Shift+I`，Console 里过滤 `[JupyterLauncher]` 看所有日志
2. **手动验证 spawn 路径**：插件设置里看你推导出来的 jupyter.exe 路径是否存在
3. **token 现场查看**：状态栏点一下复制 URL，URL 里就有 token
4. **测试 cmd.exe 回退**：临时改 `condaEnv` 为不存在的环境名，让推导路径找不到 exe，强制走 cmd 分支验证
