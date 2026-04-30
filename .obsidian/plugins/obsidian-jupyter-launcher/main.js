'use strict';

/*
 * Obsidian Jupyter Lab Launcher
 *
 * 一键通过 Anaconda 启动 Jupyter Lab，并在浏览器中打开当前活动笔记。
 * 启动方式参考用户的 通过anaconda启动JupyterLab.bat：
 *   1. 优先使用 conda 环境下的 jupyter.exe（直接 spawn，无需走 cmd）。
 *   2. 若无法定位，则回退到 cmd.exe /c "call activate.bat env && jupyter.exe lab ..."。
 */

const obsidian = require('obsidian');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

const DEFAULT_SETTINGS = {
  // 默认匹配用户的 通过anaconda启动JupyterLab.bat
  condaActivatePath: 'C:\\Users\\user\\anaconda3\\Scripts\\activate.bat',
  condaEnv: 'base',
  // 留空 = 自动从 conda 路径推导；填写则跳过推导
  jupyterExecutable: '',
  port: 8888,
  portRetries: 5,
  // 留空 = 启动时随机生成
  token: '',
  // 留空 = 使用 vault 根目录
  workDir: '',
  // 透传给 jupyter lab 的额外参数（空格分隔）
  extraArgs: '',
  // 是否对 .md 走 jupytext 的 ?factory=Notebook
  useJupytext: true,
  // Obsidian 关闭/插件卸载时是否自动停止 Jupyter
  autoStopOnUnload: false,
};

/* ---------- JupyterManager ---------- */

class JupyterManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.process = null;
    this.token = null;
    this.port = null;
    this.startingPromise = null;
  }

  log(channel, msg) {
    this.plugin.log(channel, msg);
  }

  /** 探测某个端口上是否有 Jupyter Server 在运行（HTTP 200/401/403 都算）。 */
  isAlive(port) {
    return new Promise((resolve) => {
      const req = http.get(
        { hostname: '127.0.0.1', port, path: '/api', timeout: 1500 },
        (res) => {
          resolve(res.statusCode !== undefined && res.statusCode > 0);
          res.resume();
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  }

  generateToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  /**
   * 从 condaActivatePath + condaEnv 推导出 jupyter.exe 的绝对路径。
   * 例：C:\Users\user\anaconda3\Scripts\activate.bat + base
   *     => C:\Users\user\anaconda3\Scripts\jupyter.exe
   * 例：上面 + my-env
   *     => C:\Users\user\anaconda3\envs\my-env\Scripts\jupyter.exe
   */
  deriveJupyterExe(settings) {
    const activate = settings.condaActivatePath || '';
    if (!activate) return null;
    const scriptsDir = path.dirname(activate);            // ...\anaconda3\Scripts
    const condaRoot = path.dirname(scriptsDir);            // ...\anaconda3
    const env = (settings.condaEnv || 'base').trim();
    const exeName = process.platform === 'win32' ? 'jupyter.exe' : 'jupyter';
    if (env === 'base' || env === '') {
      return path.join(condaRoot, 'Scripts', exeName);
    }
    return path.join(condaRoot, 'envs', env, 'Scripts', exeName);
  }

  buildArgs(settings, port, token, workDir) {
    const args = [
      'lab',
      '--no-browser',
      `--port=${port}`,
      '--ServerApp.open_browser=False',
      '--ServerApp.token=' + token,
      '--ServerApp.password=',
      `--ServerApp.root_dir=${workDir}`,
    ];
    const extra = (settings.extraArgs || '').trim();
    if (extra) {
      // 简单按空格切分；带空格的参数请用引号包裹然后避免空格
      args.push(...extra.split(/\s+/));
    }
    return args;
  }

  async ensureRunning() {
    // 已有内部进程并存活，直接复用
    if (this.process && this.token && this.port && await this.isAlive(this.port)) {
      return { url: `http://localhost:${this.port}`, token: this.token, port: this.port };
    }

    // 并发请求合并到同一个 promise，避免重复启动
    if (this.startingPromise) return this.startingPromise;

    this.startingPromise = this._startNew().finally(() => {
      this.startingPromise = null;
    });
    return this.startingPromise;
  }

  async _startNew() {
    const settings = this.plugin.settings;
    let workDir = settings.workDir && settings.workDir.trim()
      ? settings.workDir.trim()
      : this.plugin.getVaultPath();
    // 去掉末尾分隔符，避免 Windows 命令行 `\"` 转义问题
    workDir = workDir.replace(/[\\/]+$/, '');

    const token = (settings.token && settings.token.trim()) || this.generateToken();

    // 寻找一个空闲端口（最多尝试 portRetries 次）
    const startPort = settings.port;
    const maxRetries = Math.max(1, settings.portRetries || 1);
    let port = null;
    for (let i = 0; i < maxRetries; i++) {
      const candidate = startPort + i;
      if (!(await this.isAlive(candidate))) {
        port = candidate;
        break;
      }
    }
    if (port === null) {
      throw new Error(
        `端口 ${startPort} ~ ${startPort + maxRetries - 1} 全部被占用，请到设置中调整端口。`
      );
    }

    const args = this.buildArgs(settings, port, token, workDir);
    const child = this._spawnJupyter(settings, args, workDir);

    this.process = child;
    this.token = token;
    this.port = port;
    this.plugin.updateStatus();

    // 轮询 /api 直到成功或超时（30s）
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (this.process !== child) {
        // 期间被 stop() 替换或关闭
        throw new Error('Jupyter 启动过程中被中断');
      }
      if (await this.isAlive(port)) {
        this.log('info', `Jupyter Lab is up on port ${port}`);
        return { url: `http://localhost:${port}`, token, port };
      }
      await sleep(500);
    }

    // 超时：清理
    try { this._killChild(child); } catch (_) { /* ignore */ }
    if (this.process === child) {
      this.process = null;
      this.token = null;
      this.port = null;
      this.plugin.updateStatus();
    }
    throw new Error('Jupyter Lab 在 30 秒内没有就绪，请查看开发者控制台日志（Ctrl+Shift+I）。');
  }

  _spawnJupyter(settings, args, workDir) {
    const customExe = (settings.jupyterExecutable || '').trim();
    let cmd, cmdArgs, options;
    let usedShell = false;

    const tryDirect = (exePath) => {
      if (!exePath) return false;
      try {
        return fs.existsSync(exePath);
      } catch (_) {
        return false;
      }
    };

    if (customExe && tryDirect(customExe)) {
      cmd = customExe;
      cmdArgs = args;
      options = { cwd: workDir, windowsHide: true };
      this.log('info', `Spawning (custom): ${cmd}`);
    } else {
      const derived = this.deriveJupyterExe(settings);
      if (tryDirect(derived)) {
        cmd = derived;
        cmdArgs = args;
        options = { cwd: workDir, windowsHide: true };
        this.log('info', `Spawning (derived): ${cmd}`);
      } else {
        // 回退：cmd.exe /c "call activate.bat env && jupyter.exe lab ..."
        const activate = settings.condaActivatePath;
        const env = (settings.condaEnv || 'base').trim();
        if (!activate) {
          throw new Error('无法定位 jupyter.exe，且未配置 Conda activate.bat 路径。');
        }
        const argStr = args
          .map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
          .join(' ');
        const fullCmd = `call "${activate}" "${env}" && jupyter.exe ${argStr}`;
        cmd = 'cmd.exe';
        cmdArgs = ['/d', '/s', '/c', fullCmd];
        options = { cwd: workDir, windowsHide: true, windowsVerbatimArguments: false };
        usedShell = true;
        this.log('info', `Spawning (conda fallback): ${fullCmd}`);
      }
    }

    let child;
    try {
      child = spawn(cmd, cmdArgs, options);
    } catch (e) {
      throw new Error(`spawn 失败: ${e.message}`);
    }

    child.on('error', (err) => this.log('error', `child error: ${err.message}`));
    if (child.stdout) child.stdout.on('data', (d) => this.log('stdout', d.toString().trimEnd()));
    if (child.stderr) child.stderr.on('data', (d) => this.log('stderr', d.toString().trimEnd()));
    child.on('exit', (code, signal) => {
      this.log('exit', `Jupyter exited (code=${code}, signal=${signal})`);
      if (this.process === child) {
        this.process = null;
        this.token = null;
        this.port = null;
        this.plugin.updateStatus();
      }
    });
    child._usedShell = usedShell;
    return child;
  }

  _killChild(child) {
    if (!child || child.killed) return;
    if (process.platform === 'win32' && child.pid) {
      // 用 taskkill 干掉整个进程树（cmd.exe + jupyter.exe + python.exe）
      try {
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
      } catch (e) {
        try { child.kill(); } catch (_) { /* ignore */ }
      }
    } else {
      try { child.kill(); } catch (_) { /* ignore */ }
    }
  }

  async stop() {
    if (!this.process) return;
    this._killChild(this.process);
    this.process = null;
    this.token = null;
    this.port = null;
    this.plugin.updateStatus();
  }

  isRunning() {
    return this.process !== null && this.token !== null && this.port !== null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ---------- Settings Tab ---------- */

class JupyterLauncherSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Jupyter Lab Launcher' });
    containerEl.createEl('p', {
      text: '通过 Anaconda 启动 Jupyter Lab，并把 Obsidian 当前活动文件直接打开。默认配置匹配 vault 根目录下的「通过anaconda启动JupyterLab.bat」。',
      cls: 'setting-item-description',
    });

    new obsidian.Setting(containerEl)
      .setName('Conda activate.bat 路径')
      .setDesc('Anaconda 的 activate.bat 绝对路径。')
      .addText((text) =>
        text
          .setPlaceholder('C:\\Users\\<user>\\anaconda3\\Scripts\\activate.bat')
          .setValue(this.plugin.settings.condaActivatePath)
          .onChange(async (val) => {
            this.plugin.settings.condaActivatePath = val.trim();
            await this.plugin.saveSettings();
          })
      );

    new obsidian.Setting(containerEl)
      .setName('Conda 环境名')
      .setDesc('要使用的 conda 环境（默认 base）。')
      .addText((text) =>
        text
          .setPlaceholder('base')
          .setValue(this.plugin.settings.condaEnv)
          .onChange(async (val) => {
            this.plugin.settings.condaEnv = val.trim() || 'base';
            await this.plugin.saveSettings();
          })
      );

    new obsidian.Setting(containerEl)
      .setName('jupyter.exe 自定义路径（可选）')
      .setDesc('设置后跳过 conda 推导，直接使用该 exe。留空则按上面两项推导。')
      .addText((text) =>
        text
          .setPlaceholder('（留空 = 使用 conda 推导）')
          .setValue(this.plugin.settings.jupyterExecutable)
          .onChange(async (val) => {
            this.plugin.settings.jupyterExecutable = val.trim();
            await this.plugin.saveSettings();
          })
      );

    new obsidian.Setting(containerEl)
      .setName('监听端口')
      .setDesc('默认 8888。被占用时自动尝试 +1，最多重试次数见下方。')
      .addText((text) =>
        text
          .setPlaceholder('8888')
          .setValue(String(this.plugin.settings.port))
          .onChange(async (val) => {
            const p = parseInt(val, 10);
            if (!Number.isNaN(p) && p > 0 && p < 65536) {
              this.plugin.settings.port = p;
              await this.plugin.saveSettings();
            }
          })
      );

    new obsidian.Setting(containerEl)
      .setName('端口冲突重试次数')
      .setDesc('从基础端口开始递增，最多尝试该次数。')
      .addText((text) =>
        text
          .setPlaceholder('5')
          .setValue(String(this.plugin.settings.portRetries))
          .onChange(async (val) => {
            const n = parseInt(val, 10);
            if (!Number.isNaN(n) && n >= 1 && n <= 50) {
              this.plugin.settings.portRetries = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new obsidian.Setting(containerEl)
      .setName('固定 Token（可选）')
      .setDesc('留空则每次启动随机生成。设置后多次启动复用，方便手动访问 URL。')
      .addText((text) =>
        text
          .setPlaceholder('（留空 = 随机生成）')
          .setValue(this.plugin.settings.token)
          .onChange(async (val) => {
            this.plugin.settings.token = val.trim();
            await this.plugin.saveSettings();
          })
      );

    new obsidian.Setting(containerEl)
      .setName('工作目录（root_dir）')
      .setDesc('Jupyter 的 --ServerApp.root_dir。留空 = vault 根目录。')
      .addText((text) =>
        text
          .setPlaceholder('（留空 = vault 根目录）')
          .setValue(this.plugin.settings.workDir)
          .onChange(async (val) => {
            this.plugin.settings.workDir = val.trim();
            await this.plugin.saveSettings();
          })
      );

    new obsidian.Setting(containerEl)
      .setName('额外启动参数')
      .setDesc('透传给 jupyter lab，空格分隔。例：--ServerApp.disable_check_xsrf=true')
      .addText((text) =>
        text
          .setPlaceholder('')
          .setValue(this.plugin.settings.extraArgs)
          .onChange(async (val) => {
            this.plugin.settings.extraArgs = val;
            await this.plugin.saveSettings();
          })
      );

    new obsidian.Setting(containerEl)
      .setName('使用 jupytext 打开 .md')
      .setDesc('对 .md 文件追加 ?factory=Notebook（需要 Jupyter 端安装 jupytext）。')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.useJupytext).onChange(async (val) => {
          this.plugin.settings.useJupytext = val;
          await this.plugin.saveSettings();
        })
      );

    new obsidian.Setting(containerEl)
      .setName('插件卸载/Obsidian 退出时停止 Jupyter')
      .setDesc('默认关闭 —— 插件 disable / Obsidian 退出后保留 Jupyter 服务，可继续在浏览器使用。开启则一并清理。')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoStopOnUnload).onChange(async (val) => {
          this.plugin.settings.autoStopOnUnload = val;
          await this.plugin.saveSettings();
        })
      );

    /* --- 调试操作区 --- */
    containerEl.createEl('h3', { text: '操作' });

    new obsidian.Setting(containerEl)
      .setName('当前状态')
      .setDesc(this.plugin.manager.isRunning()
        ? `运行中（port ${this.plugin.manager.port}）`
        : '未运行')
      .addButton((btn) =>
        btn.setButtonText('启动').onClick(async () => {
          await this.plugin.startOnly();
          this.display();
        })
      )
      .addButton((btn) =>
        btn.setButtonText('停止').setWarning().onClick(async () => {
          await this.plugin.stop();
          this.display();
        })
      )
      .addButton((btn) =>
        btn.setButtonText('复制 URL').onClick(async () => {
          await this.plugin.copyUrl();
        })
      );
  }
}

/* ---------- Plugin ---------- */

class JupyterLauncherPlugin extends obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.manager = new JupyterManager(this);

    // 状态栏
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass('jupyter-launcher-status');
    this.statusBarEl.addEventListener('click', () => {
      if (this.manager.isRunning()) {
        this.copyUrl();
      } else {
        this.startOnly();
      }
    });
    this.updateStatus();

    // Ribbon 按钮
    this.addRibbonIcon('notebook-pen', 'Open in Jupyter Lab', () => this.launch());

    // 命令
    this.addCommand({
      id: 'open-in-jupyter-lab',
      name: '在 Jupyter Lab 中打开当前文件',
      callback: () => this.launch(),
    });
    this.addCommand({
      id: 'start-jupyter-lab',
      name: '启动 Jupyter Lab 服务',
      callback: () => this.startOnly(),
    });
    this.addCommand({
      id: 'stop-jupyter-lab',
      name: '停止 Jupyter Lab 服务',
      callback: () => this.stop(),
    });
    this.addCommand({
      id: 'restart-jupyter-lab',
      name: '重启 Jupyter Lab 服务',
      callback: async () => {
        await this.stop();
        await this.startOnly();
      },
    });
    this.addCommand({
      id: 'copy-jupyter-url',
      name: '复制 Jupyter Lab URL',
      callback: () => this.copyUrl(),
    });

    // 文件右键菜单
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof obsidian.TFile)) return;
        const ext = file.extension.toLowerCase();
        const ok = ext === 'ipynb' || (ext === 'md' && this.settings.useJupytext);
        if (!ok) return;
        menu.addItem((item) => {
          item
            .setTitle('在 Jupyter Lab 中打开')
            .setIcon('notebook-pen')
            .onClick(() => this.launch(file));
        });
      })
    );

    // 设置页
    this.addSettingTab(new JupyterLauncherSettingTab(this.app, this));
  }

  async onunload() {
    if (this.settings && this.settings.autoStopOnUnload && this.manager) {
      try { await this.manager.stop(); } catch (_) { /* ignore */ }
    }
  }

  log(channel, msg) {
    // 统一前缀，方便 DevTools 过滤
    // eslint-disable-next-line no-console
    console.log(`[JupyterLauncher][${channel}]`, msg);
  }

  getVaultPath() {
    const adapter = this.app.vault.adapter;
    if (adapter && typeof adapter.getBasePath === 'function') {
      return adapter.getBasePath();
    }
    if (adapter && typeof adapter.basePath === 'string') {
      return adapter.basePath;
    }
    return '';
  }

  updateStatus() {
    if (!this.statusBarEl) return;
    if (this.manager && this.manager.isRunning()) {
      this.statusBarEl.setText(`Jupyter \u25CF :${this.manager.port}`);
      this.statusBarEl.removeClass('is-stopped');
      this.statusBarEl.addClass('is-running');
      this.statusBarEl.setAttribute('aria-label', '点击复制 Jupyter URL');
    } else {
      this.statusBarEl.setText('Jupyter \u25CB');
      this.statusBarEl.removeClass('is-running');
      this.statusBarEl.addClass('is-stopped');
      this.statusBarEl.setAttribute('aria-label', '点击启动 Jupyter Lab');
    }
  }

  encodePath(p) {
    // Obsidian 的 file.path 总是用 / 分隔，逐段 encodeURIComponent
    return p.split('/').map(encodeURIComponent).join('/');
  }

  buildFileUrl(file) {
    const ext = (file.extension || '').toLowerCase();
    const useFactory = ext === 'md' && this.settings.useJupytext;
    const base = `http://localhost:${this.manager.port}/lab/tree/${this.encodePath(file.path)}`;
    const params = [`token=${encodeURIComponent(this.manager.token)}`];
    if (useFactory) params.push('factory=Notebook');
    return `${base}?${params.join('&')}`;
  }

  async launch(targetFile) {
    const file = targetFile || this.app.workspace.getActiveFile();
    if (!file) {
      new obsidian.Notice('当前没有活动文件');
      return;
    }
    const ext = file.extension.toLowerCase();
    const isNotebook = ext === 'ipynb';
    const isMarkdown = ext === 'md';
    if (!isNotebook && !isMarkdown) {
      new obsidian.Notice(`Jupyter 不支持 .${ext} 文件`);
      return;
    }
    if (isMarkdown && !this.settings.useJupytext) {
      new obsidian.Notice('当前 .md 文件未启用 jupytext，请到设置中开启或使用 .ipynb');
      return;
    }

    const notice = new obsidian.Notice('正在启动 Jupyter Lab…', 0);
    try {
      await this.manager.ensureRunning();
      const url = this.buildFileUrl(file);
      window.open(url);
      new obsidian.Notice(`已在 Jupyter Lab 中打开：${file.name}`);
    } catch (e) {
      console.error('[JupyterLauncher] launch failed:', e);
      new obsidian.Notice(`启动 Jupyter 失败：${e && e.message ? e.message : e}`, 8000);
    } finally {
      notice.hide();
      this.updateStatus();
    }
  }

  async startOnly() {
    const notice = new obsidian.Notice('正在启动 Jupyter Lab…', 0);
    try {
      const { url, token, port } = await this.manager.ensureRunning();
      window.open(`${url}/lab?token=${encodeURIComponent(token)}`);
      new obsidian.Notice(`Jupyter Lab 已启动 (port ${port})`);
    } catch (e) {
      console.error('[JupyterLauncher] start failed:', e);
      new obsidian.Notice(`启动失败：${e && e.message ? e.message : e}`, 8000);
    } finally {
      notice.hide();
      this.updateStatus();
    }
  }

  async stop() {
    if (!this.manager.isRunning()) {
      new obsidian.Notice('Jupyter 当前未在运行');
      return;
    }
    await this.manager.stop();
    this.updateStatus();
    new obsidian.Notice('已停止 Jupyter Lab 服务');
  }

  async copyUrl() {
    if (!this.manager.isRunning()) {
      new obsidian.Notice('Jupyter 未在运行');
      return;
    }
    const url = `http://localhost:${this.manager.port}/lab?token=${encodeURIComponent(this.manager.token)}`;
    try {
      await navigator.clipboard.writeText(url);
      new obsidian.Notice('Jupyter Lab URL 已复制到剪贴板');
    } catch (e) {
      new obsidian.Notice(`复制失败：${e.message || e}`);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

module.exports = JupyterLauncherPlugin;
