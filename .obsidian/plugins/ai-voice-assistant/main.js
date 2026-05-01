const {
  Plugin,
  Notice,
  PluginSettingTab,
  Setting,
  Modal,
} = require("obsidian");

const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const DEFAULT_SETTINGS = {
  pythonCommand: "python",
  assistantScript: "_ai-assistant/assistant.py",
  assistantConfig: "_ai-assistant/config.yaml",
  defaultRecordSeconds: 6,
  serverHost: "127.0.0.1",
  serverPort: 17345,
  autoStartServer: true,
  stopServerOnUnload: false,
  autoSyncCurrentNote: true,
  showProcessLogModal: true,
  dryRunByDefault: false,
};

function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function nowIso() {
  return new Date().toISOString();
}

class TextCommandModal extends Modal {
  constructor(app, plugin, initialText) {
    super(app);
    this.plugin = plugin;
    this.initialText = initialText || "";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ai-voice-assistant-modal");
    contentEl.createEl("h2", { text: "AI Voice Assistant 文本命令" });

    const textarea = contentEl.createEl("textarea", {
      attr: {
        placeholder: "例如：总结当前笔记，不要覆盖原文，只在文末追加一个 AI 总结小节。",
      },
    });
    textarea.value = this.initialText;

    const row = contentEl.createDiv({ cls: "ai-voice-assistant-button-row" });
    const cancelButton = row.createEl("button", { text: "取消" });
    const dryRunButton = row.createEl("button", { text: "Dry run" });
    const runButton = row.createEl("button", { text: "执行", cls: "mod-cta" });

    cancelButton.onclick = () => this.close();
    dryRunButton.onclick = async () => {
      const text = textarea.value.trim();
      if (!text) {
        new Notice("请输入命令。");
        return;
      }
      this.close();
      await this.plugin.runTextCommand(text, { dryRun: true });
    };
    runButton.onclick = async () => {
      const text = textarea.value.trim();
      if (!text) {
        new Notice("请输入命令。");
        return;
      }
      this.close();
      await this.plugin.runTextCommand(text, { dryRun: false });
    };

    textarea.focus();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ConfirmModal extends Modal {
  constructor(app, message, onResult) {
    super(app);
    this.message = message;
    this.onResult = onResult;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "确认 AI 助手操作" });
    contentEl.createEl("p", {
      text: "Python 助手判断这次命令可能会修改或批量影响笔记。是否继续？",
    });
    const log = contentEl.createDiv({ cls: "ai-voice-assistant-log" });
    log.setText(this.message || "等待确认。");

    const row = contentEl.createDiv({ cls: "ai-voice-assistant-button-row" });
    const cancelButton = row.createEl("button", { text: "取消" });
    const okButton = row.createEl("button", { text: "输入 YES 继续", cls: "mod-warning" });

    cancelButton.onclick = () => {
      this.close();
      this.onResult(false);
    };
    okButton.onclick = () => {
      this.close();
      this.onResult(true);
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

class LogModal extends Modal {
  constructor(app, title, logText) {
    super(app);
    this.title = title;
    this.logText = logText;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.title });
    const log = contentEl.createDiv({ cls: "ai-voice-assistant-log" });
    log.setText(this.logText || "没有输出。");
    const row = contentEl.createDiv({ cls: "ai-voice-assistant-button-row" });
    const closeButton = row.createEl("button", { text: "关闭", cls: "mod-cta" });
    closeButton.onclick = () => this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class VoiceControlModal extends Modal {
  constructor(app, plugin, options) {
    super(app);
    this.plugin = plugin;
    this.options = options || {};
    this.transcript = "";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ai-voice-assistant-modal");
    contentEl.createEl("h2", { text: "AI 语音助手控制面板" });

    this.statusEl = contentEl.createEl("p", { text: "正在检查常驻进程..." });
    this.transcriptEl = contentEl.createEl("textarea", {
      attr: {
        placeholder: "停止录音并识别后，转写文本会出现在这里。你也可以手动修改后再执行。",
      },
    });

    const row1 = contentEl.createDiv({ cls: "ai-voice-assistant-button-row" });
    const serverButton = row1.createEl("button", { text: "启动/检查常驻进程" });
    const startButton = row1.createEl("button", { text: "开始录音", cls: "mod-cta" });
    const stopButton = row1.createEl("button", { text: "停止并识别" });

    const row2 = contentEl.createDiv({ cls: "ai-voice-assistant-button-row" });
    const dryRunButton = row2.createEl("button", { text: "Dry run 执行文本" });
    const runButton = row2.createEl("button", { text: "执行文本", cls: "mod-cta" });
    const closeButton = row2.createEl("button", { text: "关闭" });

    serverButton.onclick = async () => {
      await this.refreshStatus("正在启动/检查常驻进程...");
      await this.plugin.ensureServer(true);
      await this.refreshStatus();
    };

    startButton.onclick = async () => {
      this.statusEl.setText("正在开始录音...");
      const result = await this.plugin.startManualRecording();
      this.statusEl.setText(result && result.ok ? "正在录音。说完后点击“停止并识别”。" : "开始录音失败。");
    };

    stopButton.onclick = async () => {
      this.statusEl.setText("正在停止录音并识别...");
      const result = await this.plugin.stopAndTranscribe();
      if (result && result.ok) {
        this.transcript = result.transcript || "";
        this.transcriptEl.value = this.transcript;
        const risk = result.risk && result.risk.risk_level ? result.risk.risk_level : "unknown";
        this.statusEl.setText(`识别完成。风险等级：${risk}。可编辑文本后执行。`);
      } else {
        this.statusEl.setText(`识别失败：${result && result.error ? result.error : "unknown error"}`);
      }
    };

    dryRunButton.onclick = async () => {
      await this.executeFromTextarea(true);
    };

    runButton.onclick = async () => {
      await this.executeFromTextarea(false);
    };

    closeButton.onclick = () => this.close();

    this.refreshStatus();
  }

  async refreshStatus(prefix) {
    if (prefix) this.statusEl.setText(prefix);
    const health = await this.plugin.getServerHealth();
    if (health && health.ok) {
      const state = health.state && health.state.state ? health.state.state : "idle";
      const recording = health.recording ? "录音中" : "未录音";
      this.statusEl.setText(`常驻进程已连接：${state} / ${recording}`);
    } else {
      this.statusEl.setText("常驻进程未连接。点击“启动/检查常驻进程”。");
    }
  }

  async executeFromTextarea(dryRun) {
    const text = this.transcriptEl.value.trim();
    if (!text) {
      new Notice("没有可执行的转写文本。");
      return;
    }
    this.statusEl.setText(dryRun ? "正在 dry-run..." : "正在执行...");
    const result = await this.plugin.executeTranscript(text, { dryRun });
    if (result && result.ok) {
      this.statusEl.setText(result.summary || result.message || "执行完成。");
    } else {
      this.statusEl.setText(`执行失败：${result && result.error ? result.error : "unknown error"}`);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports = class AiVoiceAssistantPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.activeProcess = null;
    this.serverProcess = null;
    this.serverOutput = "";
    this.lastOutput = "";

    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.setText("AI Voice: idle");

    this.addRibbonIcon("mic", "AI Voice Assistant", async () => {
      this.openVoiceControlPanel();
    });

    this.addCommand({
      id: "run-voice-command",
      name: "Open voice control panel",
      callback: async () => {
        this.openVoiceControlPanel();
      },
    });

    this.addCommand({
      id: "start-server",
      name: "Start resident assistant server",
      callback: async () => {
        await this.ensureServer(true);
      },
    });

    this.addCommand({
      id: "start-manual-recording",
      name: "Start recording",
      callback: async () => {
        await this.startManualRecording();
      },
    });

    this.addCommand({
      id: "stop-recording-and-transcribe",
      name: "Stop recording and transcribe",
      callback: async () => {
        const result = await this.stopAndTranscribe();
        if (result && result.transcript) {
          new TextCommandModal(this.app, this, result.transcript).open();
        }
      },
    });

    this.addCommand({
      id: "run-text-command",
      name: "Run text command",
      callback: () => {
        new TextCommandModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "sync-current-note",
      name: "Sync current note to assistant",
      callback: async () => {
        await this.syncCurrentNote(true);
      },
    });

    this.addCommand({
      id: "open-status-file",
      name: "Open assistant status file",
      callback: async () => {
        await this.openVaultFile("_ai-assistant/avatar/state.json");
      },
    });

    this.addCommand({
      id: "open-last-codex-message",
      name: "Open last Codex message",
      callback: async () => {
        await this.openVaultFile("_ai-assistant/logs/last-codex-message.md");
      },
    });

    this.addCommand({
      id: "stop-current-process",
      name: "Stop current assistant process",
      callback: () => {
        this.stopCurrentProcess();
      },
    });

    this.addSettingTab(new AiVoiceAssistantSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", async () => {
        if (this.settings.autoSyncCurrentNote) {
          await this.syncCurrentNote(false);
        }
      })
    );

    this.registerInterval(
      window.setInterval(() => {
        this.refreshStatusBar();
      }, 2000)
    );

    await this.syncCurrentNote(false);
    this.refreshStatusBar();
    if (this.settings.autoStartServer) {
      this.ensureServer(false).catch((error) => {
        console.error("AI Voice Assistant server autostart failed", error);
      });
    }
    new Notice("AI Voice Assistant 插件已加载。");
  }

  onunload() {
    if (this.activeProcess) {
      this.activeProcess.kill();
      this.activeProcess = null;
    }
    if (this.settings.stopServerOnUnload) {
      this.shutdownServer().catch(() => {});
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getVaultBasePath() {
    const adapter = this.app.vault.adapter;
    if (adapter && typeof adapter.getBasePath === "function") {
      return adapter.getBasePath();
    }
    throw new Error("AI Voice Assistant 需要 Obsidian 桌面端 FileSystemAdapter。");
  }

  getVaultFsPath(relativePath) {
    return path.join(this.getVaultBasePath(), normalizeRelativePath(relativePath));
  }

  async syncCurrentNote(showNotice) {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      if (showNotice) new Notice("当前没有打开的 Markdown 笔记。");
      return;
    }

    const payload = {
      path: activeFile.path,
      updated_at: nowIso(),
      source: "obsidian-ai-voice-assistant-plugin",
    };

    const target = "_ai-assistant/current-note.json";
    await this.ensureVaultFolder("_ai-assistant");
    await this.writeVaultText(target, JSON.stringify(payload, null, 2));

    if (showNotice) {
      new Notice(`已同步当前笔记：${activeFile.path}`);
    }
  }

  async ensureVaultFolder(folderPath) {
    const normalized = normalizeRelativePath(folderPath);
    if (!normalized) return;
    const parts = normalized.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await this.app.vault.adapter.exists(current))) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  async writeVaultText(filePath, text) {
    const normalized = normalizeRelativePath(filePath);
    if (await this.app.vault.adapter.exists(normalized)) {
      await this.app.vault.adapter.write(normalized, text);
    } else {
      await this.app.vault.create(normalized, text);
    }
  }

  async openVaultFile(filePath) {
    const normalized = normalizeRelativePath(filePath);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (!file) {
      new Notice(`找不到文件：${normalized}`);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }

  openVoiceControlPanel() {
    new VoiceControlModal(this.app, this, {}).open();
  }

  async getServerHealth() {
    try {
      return await this.requestJson("GET", "/health");
    } catch (_) {
      return null;
    }
  }

  async ensureServer(showNotice) {
    const health = await this.getServerHealth();
    if (health && health.ok) {
      if (showNotice) new Notice("AI 语音助手常驻进程已连接。");
      return health;
    }
    this.startServerProcess();
    const ready = await this.waitForServer(12000);
    if (ready && ready.ok) {
      if (showNotice) new Notice("AI 语音助手常驻进程已启动。");
      return ready;
    }
    throw new Error("AI 语音助手常驻进程启动超时。");
  }

  startServerProcess() {
    if (this.serverProcess) return;
    const vaultBasePath = this.getVaultBasePath();
    const script = normalizeRelativePath(this.settings.assistantScript);
    const config = normalizeRelativePath(this.settings.assistantConfig);
    const args = [
      script,
      "--config",
      config,
      "server",
      "--host",
      String(this.settings.serverHost || "127.0.0.1"),
      "--port",
      String(this.settings.serverPort || 17345),
    ];
    const env = Object.assign({}, process.env, {
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
    });

    this.serverOutput = "";
    this.writePluginLog(`$ ${this.settings.pythonCommand} ${args.join(" ")}\n`);
    const proc = childProcess.spawn(this.settings.pythonCommand, args, {
      cwd: vaultBasePath,
      env,
      shell: false,
      windowsHide: true,
    });
    this.serverProcess = proc;

    proc.stdout.on("data", async (chunk) => {
      const text = chunk.toString("utf8");
      this.serverOutput += text;
      await this.appendPluginLog(`[server stdout] ${text}`);
    });
    proc.stderr.on("data", async (chunk) => {
      const text = chunk.toString("utf8");
      this.serverOutput += text;
      await this.appendPluginLog(`[server stderr] ${text}`);
    });
    proc.on("error", async (error) => {
      this.serverOutput += `\n[server process error] ${error.message}\n`;
      await this.appendPluginLog(`\n[server process error] ${error.message}\n`);
    });
    proc.on("close", async (code) => {
      this.serverProcess = null;
      await this.appendPluginLog(`\n[server exit] ${code}\n`);
      this.refreshStatusBar();
    });
  }

  async waitForServer(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const health = await this.getServerHealth();
      if (health && health.ok) return health;
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
    return null;
  }

  requestJson(method, pathname, body) {
    const host = this.settings.serverHost || "127.0.0.1";
    const port = Number(this.settings.serverPort) || 17345;
    const payload = body ? JSON.stringify(body) : "";
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: host,
          port,
          path: pathname,
          method,
          timeout: 120000,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            try {
              const parsed = text ? JSON.parse(text) : {};
              if (res.statusCode >= 400) {
                reject(new Error(parsed.error || text || `HTTP ${res.statusCode}`));
              } else {
                resolve(parsed);
              }
            } catch (error) {
              reject(new Error(`无法解析 server JSON：${error.message}; raw=${text.slice(0, 300)}`));
            }
          });
        }
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy(new Error("请求 AI 语音助手常驻进程超时。"));
      });
      if (payload) req.write(payload);
      req.end();
    });
  }

  async startManualRecording() {
    await this.syncCurrentNote(false);
    await this.ensureServer(false);
    const result = await this.requestJson("POST", "/record/start", {});
    new Notice("AI 语音助手开始录音。");
    this.refreshStatusBar();
    return result;
  }

  async stopAndTranscribe() {
    await this.ensureServer(false);
    const result = await this.requestJson("POST", "/record/stop-transcribe", {});
    if (result && result.ok) {
      new Notice("AI 语音助手识别完成。");
    }
    this.refreshStatusBar();
    return result;
  }

  async executeTranscript(text, options) {
    await this.syncCurrentNote(false);
    await this.ensureServer(false);
    const dryRun = Boolean(options && options.dryRun);
    let result = await this.requestJson("POST", "/run-text", {
      text,
      dry_run: dryRun,
      confirmed: false,
      no_speak: false,
    });

    if (result && result.status === "requires_confirmation") {
      const confirmed = await new Promise((resolve) => {
        new ConfirmModal(this.app, result.message + "\n\n" + text, resolve).open();
      });
      if (!confirmed) {
        new Notice("已取消执行。");
        return { ok: true, status: "cancelled", message: "已取消执行。" };
      }
      result = await this.requestJson("POST", "/run-text", {
        text,
        dry_run: dryRun,
        confirmed: true,
        no_speak: false,
      });
    }

    if (result && result.ok) {
      new Notice(result.summary || result.message || "AI 语音助手已完成。");
      if (this.settings.showProcessLogModal && (result.result || result.summary)) {
        new LogModal(this.app, dryRun ? "AI Voice dry-run output" : "AI Voice output", result.result || result.summary).open();
      }
    }
    this.refreshStatusBar();
    return result;
  }

  async shutdownServer() {
    try {
      await this.requestJson("POST", "/shutdown", {});
    } catch (_) {
      // ignore: server may already be stopped
    }
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  async runVoiceCommand(options) {
    this.openVoiceControlPanel();
  }

  async runVoiceCommandLegacy(options) {
    await this.syncCurrentNote(false);
    const seconds = Number(this.settings.defaultRecordSeconds) || 6;
    const args = ["voice", "--seconds", String(seconds)];
    if (options && options.dryRun) args.push("--dry-run");
    await this.runAssistant(args, { title: options && options.dryRun ? "AI Voice dry-run" : "AI Voice command" });
  }

  async runTextCommand(text, options) {
    return await this.executeTranscript(text, { dryRun: Boolean(options && options.dryRun) });
  }

  async runAssistant(commandArgs, options) {
    if (this.activeProcess) {
      new Notice("AI 助手已有任务在运行。");
      return;
    }

    const vaultBasePath = this.getVaultBasePath();
    const script = normalizeRelativePath(this.settings.assistantScript);
    const config = normalizeRelativePath(this.settings.assistantConfig);
    const args = [script, "--config", config].concat(commandArgs);
    const env = Object.assign({}, process.env, {
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
    });

    this.lastOutput = "";
    await this.writePluginLog(`$ ${this.settings.pythonCommand} ${args.join(" ")}\n`);

    new Notice(`${options.title} started`);
    this.statusBarItem.setText("AI Voice: running");

    await new Promise((resolve) => {
      let confirmationOpen = false;
      const proc = childProcess.spawn(this.settings.pythonCommand, args, {
        cwd: vaultBasePath,
        env,
        shell: false,
        windowsHide: true,
      });

      this.activeProcess = proc;

      const handleChunk = async (chunk, streamName) => {
        const text = chunk.toString("utf8");
        this.lastOutput += text;
        await this.appendPluginLog(`[${streamName}] ${text}`);
        this.maybeHandleConfirmation(proc, text, () => confirmationOpen, (value) => {
          confirmationOpen = value;
        });
      };

      proc.stdout.on("data", (chunk) => {
        handleChunk(chunk, "stdout");
      });
      proc.stderr.on("data", (chunk) => {
        handleChunk(chunk, "stderr");
      });

      proc.on("error", async (error) => {
        this.lastOutput += `\n[process error] ${error.message}\n`;
        await this.appendPluginLog(`\n[process error] ${error.message}\n`);
      });

      proc.on("close", async (code) => {
        this.activeProcess = null;
        this.refreshStatusBar();
        await this.appendPluginLog(`\n[exit] ${code}\n`);
        if (code === 0) {
          new Notice("AI Voice Assistant 已完成。");
        } else {
          new Notice(`AI Voice Assistant 退出码：${code}`);
        }
        if (this.settings.showProcessLogModal || code !== 0) {
          new LogModal(this.app, `${options.title} output`, this.lastOutput).open();
        }
        resolve();
      });
    });
  }

  maybeHandleConfirmation(proc, text, getConfirmationOpen, setConfirmationOpen) {
    if (getConfirmationOpen()) return;
    if (!text.includes("请输入 YES") && !text.includes("输入 YES") && !text.includes("风险等级")) return;

    setConfirmationOpen(true);
    new ConfirmModal(this.app, this.lastOutput.slice(-2000), (confirmed) => {
      try {
        proc.stdin.write(confirmed ? "YES\n" : "\n");
      } catch (error) {
        new Notice(`无法向助手发送确认：${error.message}`);
      } finally {
        setConfirmationOpen(false);
      }
    }).open();
  }

  stopCurrentProcess() {
    if (this.serverProcess) {
      this.shutdownServer();
      this.statusBarItem.setText("AI Voice: server stopped");
      new Notice("已停止 AI 语音助手常驻进程。");
      return;
    }
    if (!this.activeProcess) {
      new Notice("当前没有正在运行的 AI 助手任务。");
      return;
    }
    this.activeProcess.kill();
    this.activeProcess = null;
    this.statusBarItem.setText("AI Voice: stopped");
    new Notice("已停止 AI 助手任务。");
  }

  refreshStatusBar() {
    if (this.activeProcess) {
      this.statusBarItem.setText("AI Voice: running");
      return;
    }
    try {
      const statePath = this.getVaultFsPath("_ai-assistant/avatar/state.json");
      if (!fs.existsSync(statePath)) {
        this.statusBarItem.setText("AI Voice: idle");
        return;
      }
      const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      this.statusBarItem.setText(`AI Voice: ${state.state || "idle"}`);
    } catch (error) {
      this.statusBarItem.setText("AI Voice: status error");
    }
  }

  getPluginLogPath() {
    return path.join(".obsidian", "plugins", this.manifest.id || "ai-voice-assistant", "last-run.log");
  }

  async writePluginLog(text) {
    const logPath = this.getPluginLogPath();
    const fullPath = path.isAbsolute(logPath) ? logPath : path.join(this.getVaultBasePath(), logPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, text, "utf8");
  }

  async appendPluginLog(text) {
    const logPath = this.getPluginLogPath();
    const fullPath = path.isAbsolute(logPath) ? logPath : path.join(this.getVaultBasePath(), logPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.appendFileSync(fullPath, text, "utf8");
  }
};

class AiVoiceAssistantSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "AI Voice Assistant 设置" });

    new Setting(containerEl)
      .setName("Python command")
      .setDesc("通常为 python。如果 Obsidian 找不到 Python，可以改成完整 python.exe 路径。")
      .addText((text) =>
        text
          .setPlaceholder("python")
          .setValue(this.plugin.settings.pythonCommand)
          .onChange(async (value) => {
            this.plugin.settings.pythonCommand = value.trim() || "python";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Assistant script")
      .setDesc("相对 vault 根目录的 Python 助手脚本路径。")
      .addText((text) =>
        text
          .setPlaceholder("_ai-assistant/assistant.py")
          .setValue(this.plugin.settings.assistantScript)
          .onChange(async (value) => {
            this.plugin.settings.assistantScript = normalizeRelativePath(value || DEFAULT_SETTINGS.assistantScript);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Assistant config")
      .setDesc("相对 vault 根目录的 Python 助手配置文件路径。")
      .addText((text) =>
        text
          .setPlaceholder("_ai-assistant/config.yaml")
          .setValue(this.plugin.settings.assistantConfig)
          .onChange(async (value) => {
            this.plugin.settings.assistantConfig = normalizeRelativePath(value || DEFAULT_SETTINGS.assistantConfig);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Server host")
      .setDesc("常驻 Python 助手 HTTP server 监听地址。")
      .addText((text) =>
        text
          .setPlaceholder("127.0.0.1")
          .setValue(String(this.plugin.settings.serverHost || "127.0.0.1"))
          .onChange(async (value) => {
            this.plugin.settings.serverHost = value.trim() || "127.0.0.1";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Server port")
      .setDesc("常驻 Python 助手 HTTP server 端口。")
      .addText((text) =>
        text
          .setPlaceholder("17345")
          .setValue(String(this.plugin.settings.serverPort || 17345))
          .onChange(async (value) => {
            const parsed = Number(value);
            this.plugin.settings.serverPort = Number.isFinite(parsed) && parsed > 0 ? parsed : 17345;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto start resident server")
      .setDesc("插件加载时自动启动常驻 Python 助手，减少第一次语音命令等待。")
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.plugin.settings.autoStartServer))
          .onChange(async (value) => {
            this.plugin.settings.autoStartServer = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Stop server on plugin unload")
      .setDesc("关闭 Obsidian 或禁用插件时停止常驻 Python 助手。默认关闭，避免误杀正在执行的任务。")
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.plugin.settings.stopServerOnUnload))
          .onChange(async (value) => {
            this.plugin.settings.stopServerOnUnload = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Legacy default record seconds")
      .setDesc("仅旧的固定时长 CLI 流程使用；新控制面板不再固定录音秒数。")
      .addText((text) =>
        text
          .setPlaceholder("6")
          .setValue(String(this.plugin.settings.defaultRecordSeconds))
          .onChange(async (value) => {
            const parsed = Number(value);
            this.plugin.settings.defaultRecordSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 6;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto sync current note")
      .setDesc("切换笔记时，自动写入 _ai-assistant/current-note.json。")
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.plugin.settings.autoSyncCurrentNote))
          .onChange(async (value) => {
            this.plugin.settings.autoSyncCurrentNote = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Show process log modal")
      .setDesc("任务结束后显示本次 Python 助手输出。")
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.plugin.settings.showProcessLogModal))
          .onChange(async (value) => {
            this.plugin.settings.showProcessLogModal = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Ribbon uses dry-run")
      .setDesc("开启后，点击左侧麦克风只做 dry-run，不实际修改笔记。")
      .addToggle((toggle) =>
        toggle
          .setValue(Boolean(this.plugin.settings.dryRunByDefault))
          .onChange(async (value) => {
            this.plugin.settings.dryRunByDefault = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
