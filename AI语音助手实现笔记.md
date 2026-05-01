## Obsidian AI 语音助手 — 实现笔记

> 配套设计文档：[[AI虚拟形象语音助手设计.md]]
> Python 助手入口：`[[_ai-assistant/assistant.py]]`
> Obsidian 插件入口：`[[.obsidian/plugins/ai-voice-assistant/README.md]]`

记录把“AI 虚拟形象语音助手”从设计文档落到可用 MVP 的过程。当前实现已经从 v0.1 的“每次启动 Python + 固定 6 秒录音”升级到 v0.2 的“常驻 Python server + Obsidian UI 手动开始/停止录音”。重点不是“语音助手可以做什么”，而是几个 **如果重写一次还是会这么做** 的技术决策、代码边界和踩坑修复。

---

### 一、最终交付物

这次不是一个纯 Obsidian 插件，而是 **Obsidian 插件 + Python 本地助手** 的组合。

```text
_ai-assistant/
├── assistant.py                 # Python 主程序，约 600 行
├── config.yaml                  # 主配置：STT / TTS / Codex / 安全策略
├── config.test.yaml             # 测试配置：关闭自动播放等
├── requirements.txt             # OpenAI STT / Edge TTS / 录音依赖
├── requirements-whisper.txt     # 可选 faster-whisper 依赖
├── current-note.json            # 当前笔记桥接文件
├── prompts/
│   ├── execution_prompt.md      # 发给 Codex 的执行提示词模板
│   ├── command_router.md        # 后续命令路由预留
│   └── result_summarizer.md     # 结果压缩成语音摘要
├── audio/
│   ├── input/last.wav           # 最近一次录音
│   └── output/last.mp3          # 最近一次 TTS 输出
├── avatar/state.json            # 虚拟形象状态文件
└── logs/
    ├── actions.jsonl            # 操作日志
    ├── last-transcript.txt      # 最近一次 STT 文本
    └── last-codex-message.md    # 最近一次 Codex 返回
```

Obsidian 插件部分：

```text
.obsidian/plugins/ai-voice-assistant/
├── manifest.json                # 插件 ID / 名称 / desktopOnly
├── main.js                      # 单文件原生 JS，约 560 行
├── styles.css                   # modal / log 样式
├── data.json                    # 插件设置
└── README.md                    # 使用说明
```

外加一处启用配置：

```text
.obsidian/community-plugins.json
```

末尾追加：

```json
"ai-voice-assistant"
```

插件显示名：

```text
AI 语音助手
```

---

### 二、为什么拆成 Obsidian 插件 + Python 助手

一开始最自然的想法是：把所有逻辑都写进 Obsidian 插件里。但最后我没有这么做。

| 维度 | 全部写进 Obsidian 插件 | 插件 + Python 助手 |
|---|---|---|
| 麦克风录音 | Electron / 浏览器 API，权限和音频保存较麻烦 | `sounddevice + soundfile` 简单直接 |
| OpenAI STT | JS SDK 可做，但和本地音频流组合麻烦 | Python SDK + 文件上传更直接 |
| faster-whisper | JS 侧不合适 | Python 侧天然适配 |
| Codex CLI | JS 可以 spawn | Python 也可以 spawn，且和现有脚本统一 |
| Obsidian 当前笔记 | 插件天然知道 | 通过 `current-note.json` 桥接 |
| 调试方式 | 重载 Obsidian | 命令行可单独测每一段 |

最后的边界是：

```text
Obsidian 插件负责：
  - 当前笔记感知
  - ribbon / 命令面板入口
  - 弹窗确认
  - 启动/复用常驻 Python server
  - 通过 HTTP 调用录音、识别、执行接口
  - 显示状态和日志

Python 助手负责：
  - 常驻 HTTP server
  - 录音
  - STT
  - Codex CLI 调用
  - TTS
  - 安全策略
  - 日志和状态文件
```

这个拆法的核心收益是：**语音链路可以脱离 Obsidian 单独测试**。例如：

```powershell
python _ai-assistant\assistant.py say "你好，我是你的 Obsidian 语音助手。"
python _ai-assistant\assistant.py record --seconds 5
python _ai-assistant\assistant.py transcribe _ai-assistant\audio\input\last.wav
python _ai-assistant\assistant.py run-text "总结当前笔记，不要覆盖原文，只追加总结。"
python _ai-assistant\assistant.py server
```

旧的固定时长 CLI 流程 `python _ai-assistant\assistant.py voice --seconds 6` 仍保留，主要用于排查问题。

---

### 三、整体流程

v0.2 真实语音流程：

```text
用户点击 Obsidian 左侧麦克风
    │
    ▼
插件 syncCurrentNote()
    │  写入 _ai-assistant/current-note.json
    ▼
插件 ensureServer()
    │  已有 server：复用
    │  没有 server：spawn("python", ["_ai-assistant/assistant.py", "--config", "...", "server"])
    │
    ▼
用户在 VoiceControlModal 点击“开始录音”
    ▼
POST /record/start
    │  ManualRecorder + sounddevice.InputStream
    ▼
用户说完后点击“停止并识别”
    ▼
POST /record/stop-transcribe
    │  写出 audio/input/last.wav → OpenAI STT / faster-whisper
    ▼
用户检查/编辑转写文本
    ▼
POST /run-text
    │  风险判断 / 必要时确认 / Codex 执行 / TTS 总结
    ▼
avatar/state.json = done
```

这里没有让 Obsidian 插件直接理解语音命令。插件只负责“把上下文交给 Python”，真正的智能链路放在 Python 侧。

---

### 四、Python 主程序：assistant.py

#### 4.1 配置读取：`config.yaml`

核心配置：

```yaml
voice:
  stt_provider: "openai"
  openai_stt_model: "gpt-4o-mini-transcribe"
  faster_whisper_model: "small"
  language: "zh"
  record_seconds: 6 # 仅旧 CLI 固定时长流程使用

tts:
  provider: "edge-tts"
  edge_voice: "zh-CN-XiaoxiaoNeural"
  fallback_provider: "windows-sapi"

server:
  host: "127.0.0.1"
  port: 17345

execution:
  mode: "codex-cli"
  codex_command: "C:/Users/user/AppData/Roaming/npm/codex.cmd"
  sandbox: "workspace-write"
  approval_policy: "never"
```

代码里用 `cfg_get(config, "voice.stt_provider", "openai")` 这种 dotted path 读取配置：

```python
def cfg_get(config, dotted, default=None):
    cur = config
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return default
        cur = cur[part]
    return cur
```

小而实用：后续新增配置不会牵一发动全身。

#### 4.2 状态文件：给“虚拟形象”预留接口

第一版还没有真正做 Live2D，但已经把状态事件抽象出来：

```python
write_state(config, vault_root, "listening", "正在录音，点击停止后开始识别")
write_state(config, vault_root, "transcribing", "正在使用 openai 识别语音")
write_state(config, vault_root, "executing", "正在调用 Codex 执行任务")
write_state(config, vault_root, "done", summary)
write_state(config, vault_root, "error", message)
```

落盘文件：

```text
_ai-assistant/avatar/state.json
```

示例：

```json
{
  "state": "done",
  "message": "已完成。已读取当前笔记路径：[[React-CompoundComponents-模式笔记.md]]，未修改任何文件。",
  "updated_at": "2026-05-01T17:29:37+09:00"
}
```

这个设计是为了后续平滑升级：

```text
state.json
  ├─ Obsidian 状态栏
  ├─ Obsidian 侧边栏面板
  ├─ Live2D 网页面板
  └─ 桌面虚拟形象
```

#### 4.3 当前笔记桥接：`current-note.json`

外部 Python 脚本不知道 Obsidian 当前打开的是哪篇笔记，所以设计了一个很朴素的桥：

```text
_ai-assistant/current-note.json
```

内容：

```json
{
  "path": "React-CompoundComponents-模式笔记.md",
  "updated_at": "2026-05-01T00:00:00+09:00",
  "source": "obsidian-ai-voice-assistant-plugin"
}
```

Python 只做读取：

```python
def get_current_note(config, vault_root):
    state_file = resolve_vault_path(vault_root, cfg_get(config, "current_note.state_file"))
    if state_file.exists():
        payload = json.loads(state_file.read_text(encoding="utf-8"))
        return payload.get("path")
    return cfg_get(config, "current_note.fallback_path", "")
```

Obsidian 插件负责写入。这是整个项目里最重要的“低耦合接口”之一。

---

### 五、STT：OpenAI 默认，faster-whisper 备用

#### 5.1 为什么不强依赖 faster-whisper

之前本地 Whisper 环境失败过，所以这次没有把 MVP 押在本地模型上。配置上做成可切换：

```yaml
voice:
  stt_provider: "openai"          # 默认
  faster_whisper_model: "small"   # 备用
```

分发函数：

```python
def transcribe_audio(config, vault_root, audio_path):
    provider = cfg_get(config, "voice.stt_provider", "openai")
    write_state(config, vault_root, "transcribing", f"正在使用 {provider} 识别语音")
    if provider == "openai":
        return transcribe_openai(config, audio_path)
    if provider == "faster-whisper":
        return transcribe_faster_whisper(config, audio_path)
    raise SystemExit(f"未知 STT provider：{provider}")
```

#### 5.2 OpenAI STT 的环境变量坑

一开始用户在另一个 PowerShell 窗口里设置：

```powershell
$env:OPENAI_API_KEY="..."
```

但 Claudian / Obsidian 启动的 PowerShell 看不到。原因是 `$env:` 只影响当前进程和它的子进程。

最后做了两层处理：

1. 把 key 写到 Windows User 环境变量。
2. Python 在启动时，如果当前进程没有 key，就主动查 Windows 注册表。

关键函数：

```python
def ensure_openai_api_key_loaded():
    if os.getenv("OPENAI_API_KEY") or os.name != "nt":
        return
    import winreg
    candidates = [
        (winreg.HKEY_CURRENT_USER, r"Environment"),
        (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"),
    ]
    for hive, subkey in candidates:
        with winreg.OpenKey(hive, subkey) as key:
            value, _typ = winreg.QueryValueEx(key, "OPENAI_API_KEY")
            if value:
                os.environ["OPENAI_API_KEY"] = str(value)
                return
```

这段的意义是：**不强迫用户重启 Obsidian，也能尽量读到新设置的用户级环境变量**。

#### 5.3 STT 实测

为了避免无人对麦克风说话导致测试不稳定，我用 TTS 先生成一句语音命令，再拿这段 mp3 去测 OpenAI STT。

流程：

```text
Edge TTS 生成测试语音
→ OpenAI STT 转写
→ Codex 执行只读任务
→ Edge TTS 生成结果语音
```

实测转写：

```text
请止读取当前笔记路径,并返回一句中文确认,不要修改任何文件。
```

“只”被识别成“止”，但 Codex 仍能理解语义。

---

### 六、TTS：Edge TTS 默认，Windows SAPI 兜底

TTS 走两层：

```text
edge-tts → 生成 last.mp3
失败时 → Windows SAPI 直接朗读
```

核心代码：

```python
async def speak_edge_tts_async(config, vault_root, text):
    voice = cfg_get(config, "tts.edge_voice", "zh-CN-XiaoxiaoNeural")
    output = resolve_vault_path(vault_root, "_ai-assistant/audio/output/last.mp3")
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output))
    return output
```

播放策略：

```python
if ffplay:
    subprocess.run([ffplay, "-nodisp", "-autoexit", "-loglevel", "quiet", str(path)])
elif os.name == "nt":
    os.startfile(str(path))
```

这里的取舍：

- 有 `ffplay` 时阻塞播放，体验最好。
- 没有 `ffplay` 时用系统默认播放器打开。
- 测试配置 `config.test.yaml` 里关闭 `play_audio`，避免自动弹播放器。

---

### 七、Codex 执行层

#### 7.1 为什么用 `codex.cmd`

Windows 上 npm 全局安装的 Codex 可能同时有：

```text
codex.ps1
codex.cmd
```

PowerShell 执行策略可能会拦 `.ps1`，所以配置里直接使用更稳的：

```yaml
execution:
  codex_command: "C:/Users/user/AppData/Roaming/npm/codex.cmd"
```

这也是从 Claudian/Codex Windows 配置里继承下来的经验：GUI 或 PowerShell 驱动的场景里，`.cmd` 比 `.ps1` 更少踩坑。

#### 7.2 给 Codex 的 prompt

不是直接把用户语音原文丢给 Codex，而是套一层执行模板：

```markdown
你是一个在用户 Obsidian vault 中工作的 AI 助手。

## 当前上下文

- Vault 根目录：`{vault_root}`
- 当前笔记：`{current_note_path}`
- 用户语音命令：`{user_text}`

## 执行规则

1. 优先操作 Markdown 笔记，使用 Obsidian 友好的格式。
2. 提到 vault 文件时，尽量使用 wiki-link。
3. 不要删除文件，除非用户命令已经明确确认。
4. 不要批量修改大量文件，除非任务明确要求且已经确认。
5. 如果是“当前笔记”相关任务，请优先使用当前笔记路径。
6. 完成后，用中文给出 1-2 句简短成果总结。
```

模板文件：

```text
_ai-assistant/prompts/execution_prompt.md
```

#### 7.3 Codex CLI 参数顺序坑

一开始调用失败：

```text
error: unexpected argument '--ask-for-approval' found
```

原因是 `--ask-for-approval` 是 Codex CLI 的全局参数，必须放在 `exec` 子命令前面。

错误结构：

```text
codex exec --ask-for-approval never ...
```

正确结构：

```text
codex --ask-for-approval never exec ...
```

当前代码：

```python
cmd = [
    str(codex_cmd),
    "--ask-for-approval",
    cfg_get(config, "execution.approval_policy", "never"),
    "exec",
    "--cd",
    str(vault_root),
    "--sandbox",
    cfg_get(config, "execution.sandbox", "workspace-write"),
    "-o",
    str(output_file),
]
```

这是一个典型的“help 看起来都在一起，实际解析层级不同”的 CLI 坑。

---

### 八、安全机制

语音命令容易误触，所以 Python 侧做了第一层风险判断：

```python
HIGH_RISK_PATTERNS = [
    r"删除", r"清空", r"移除", r"覆盖", r"重命名", r"移动",
    r"批量", r"全部", r"所有",
    r"delete", r"remove", r"rename", r"move", r"overwrite",
    r"shell", r"命令行",
]
```

风险分类：

```python
def classify_risk(user_text):
    high = any(re.search(pattern, lower, re.IGNORECASE) for pattern in HIGH_RISK_PATTERNS)
    write = high or any(re.search(pattern, lower, re.IGNORECASE) for pattern in WRITE_PATTERNS)
    risk = "high" if high else ("medium" if write else "low")
    return {"risk_level": risk, "needs_write": write}
```

如果不是 low 风险，命令行要求输入：

```text
如果确认执行，请输入 YES：
```

Obsidian 插件监听 stdout/stderr，如果发现 `请输入 YES` 或 `风险等级`，就弹出确认 modal。

```javascript
maybeHandleConfirmation(proc, text, getConfirmationOpen, setConfirmationOpen) {
  if (!text.includes("请输入 YES") && !text.includes("输入 YES") && !text.includes("风险等级")) return;

  new ConfirmModal(this.app, this.lastOutput.slice(-2000), (confirmed) => {
    proc.stdin.write(confirmed ? "YES\n" : "\n");
  }).open();
}
```

这个设计的优点是：**确认逻辑仍在 Python 侧，Obsidian 插件只负责把用户确认传回 stdin**。

---

### 九、Obsidian 插件实现

#### 9.1 为什么继续直接写 `main.js`

这次参考了 [[obsidian-jupyter-plugin-implementation.md]] 的取舍：插件规模不大，直接写原生 JS。

| 维度 | TS + bundle | 直接写 main.js |
|---|---|---|
| 类型检查 | 强 | 弱 |
| 调试速度 | 改 → build → reload | 改 → reload |
| 用户审计 | bundle 后不可读 | 可逐行看 |
| 当前规模 | 偏重 | 合适 |

兜底方式：

```powershell
node --check .obsidian\plugins\ai-voice-assistant\main.js
```

已验证通过。

#### 9.2 onload：注册入口

插件加载时做几件事：

```javascript
this.statusBarItem = this.addStatusBarItem();
this.statusBarItem.setText("AI Voice: idle");

this.addRibbonIcon("mic", "AI Voice Assistant", async () => {
  this.openVoiceControlPanel();
});

this.addCommand({ id: "run-voice-command", name: "Open voice control panel", callback: async () => ... });
this.addCommand({ id: "start-server", name: "Start resident assistant server", callback: async () => ... });
this.addCommand({ id: "start-manual-recording", name: "Start recording", callback: async () => ... });
this.addCommand({ id: "stop-recording-and-transcribe", name: "Stop recording and transcribe", callback: async () => ... });
this.addCommand({ id: "run-text-command", name: "Run text command", callback: () => ... });
```

命令面板中会显示在插件名前缀下：

```text
AI 语音助手: Open voice control panel
AI 语音助手: Start resident assistant server
AI 语音助手: Start recording
AI 语音助手: Stop recording and transcribe
AI 语音助手: Run text command
AI 语音助手: Sync current note to assistant
AI 语音助手: Open assistant status file
AI 语音助手: Open last Codex message
AI 语音助手: Stop current assistant process
```

#### 9.3 当前笔记同步

插件天然知道当前 active file：

```javascript
const activeFile = this.app.workspace.getActiveFile();
```

写入桥接文件：

```javascript
const payload = {
  path: activeFile.path,
  updated_at: nowIso(),
  source: "obsidian-ai-voice-assistant-plugin",
};

await this.writeVaultText("_ai-assistant/current-note.json", JSON.stringify(payload, null, 2));
```

触发时机：

```javascript
this.app.workspace.on("active-leaf-change", async () => {
  if (this.settings.autoSyncCurrentNote) {
    await this.syncCurrentNote(false);
  }
});
```

以及每次执行命令前也会主动同步一次，避免状态落后。

#### 9.4 调 Python：spawn 而不是 shell 拼接

核心：

```javascript
const args = [script, "--config", config].concat(commandArgs);

const proc = childProcess.spawn(this.settings.pythonCommand, args, {
  cwd: vaultBasePath,
  env,
  shell: false,
  windowsHide: true,
});
```

这里故意不用 `shell: true` 拼字符串，理由：

- 语音命令里可能有引号、中文、标点。
- spawn args 数组更不容易被 shell 转义坑到。
- Windows 下路径含空格时更稳。

#### 9.5 插件日志

插件自身也写一份最近一次运行日志：

```text
.obsidian/plugins/ai-voice-assistant/last-run.log
```

用途是排查：

- Python 有没有启动。
- stdout / stderr 输出了什么。
- 是否卡在 YES 确认。
- 退出码是多少。

Python 侧日志则在：

```text
_ai-assistant/logs/actions.jsonl
_ai-assistant/logs/last-codex-message.md
_ai-assistant/logs/last-transcript.txt
```

两层日志分别服务不同问题：

| 日志 | 解决什么问题 |
|---|---|
| 插件 last-run.log | Obsidian 有没有成功调用 Python |
| actions.jsonl | 语音命令生命周期 |
| last-transcript.txt | STT 到底听成了什么 |
| last-codex-message.md | Codex 实际返回了什么 |

---

### 十、测试策略

#### 10.1 先测 Python，不碰 Obsidian

```powershell
python -X utf8 -m py_compile _ai-assistant\assistant.py
python -X utf8 _ai-assistant\assistant.py --help
python -X utf8 _ai-assistant\assistant.py current-note
```

#### 10.2 测 TTS

```powershell
python _ai-assistant\assistant.py say "你好，我是你的 Obsidian 语音助手。"
```

产物：

```text
_ai-assistant/audio/output/last.mp3
```

#### 10.3 测录音

```powershell
python _ai-assistant\assistant.py record --seconds 1
```

产物：

```text
_ai-assistant/audio/input/last.wav
```

#### 10.4 测 OpenAI STT

```powershell
python _ai-assistant\assistant.py transcribe _ai-assistant\audio\input\last.wav
```

如果报：

```text
OPENAI_API_KEY 未设置
```

说明当前进程和 Windows User/Machine 环境变量都不可见。

#### 10.5 测 Codex dry-run

```powershell
python _ai-assistant\assistant.py run-text "总结当前笔记，不要覆盖原文，只说明将会做什么。" --dry-run --yes --no-speak
```

这个命令不会真正调用 Codex，只会打印最终 prompt。

#### 10.6 测 Codex 实际调用

用只读命令：

```powershell
python _ai-assistant\assistant.py run-text "请只读取当前笔记路径并返回一句中文确认，不要修改任何文件。" --yes --no-speak
```

实测返回：

```text
已读取当前笔记路径：[[React-CompoundComponents-模式笔记.md]]，未修改任何文件。
```

#### 10.7 测插件语法

```powershell
node --check .obsidian\plugins\ai-voice-assistant\main.js
```

#### 10.8 测 Obsidian 加载

插件新建后，如果 Obsidian 已经开着，通常不会自动扫描新插件。需要：

```text
Ctrl + R
```

或重启 Obsidian。

插件列表里搜：

```text
AI 语音助手
```

或者：

```text
ai-voice-assistant
```

---

### 十一、踩坑记录

#### 11.1 环境变量不是全局即时生效

`$env:OPENAI_API_KEY=...` 只对当前 PowerShell 生效。Obsidian / Claudian 已经启动的话，不会自动继承。

最终处理：

```powershell
[Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "...", "User")
```

并在 Python 中补了注册表读取。

#### 11.2 Codex 参数顺序

`--ask-for-approval` 是全局参数，不是 `exec` 子命令参数。必须放在 `exec` 前。

#### 11.3 Obsidian 不会实时发现新插件

写入 `.obsidian/community-plugins.json` 不代表 UI 立刻刷新。需要重载窗口。

#### 11.4 中文输出编码

PowerShell 某些输出会显示乱码，但文件本身是 UTF-8 正常的。排查文件时尽量用：

```powershell
python -X utf8 -c "from pathlib import Path; print(Path('...').read_text(encoding='utf-8'))"
```

不要只看终端渲染。

#### 11.5 STT 不一定逐字准确

OpenAI STT 把“只”识别成“止”过，但语义仍然可用。后续如果要更稳，可以在 STT 后加一层“命令纠错/规范化”：

```text
请止读取 → 请只读取
把当前比记 → 把当前笔记
```

---

### 十二、下一步改进

#### 12.1 做真正的侧边栏虚拟形象

当前只有 `state.json` 和状态栏。下一步可以做 Obsidian view：

```text
idle        待机
listening   正在听
thinking    正在思考
executing   正在操作笔记
speaking    正在播报
done        完成
error       失败
```

#### 12.2 加命令路由层

现在主要依赖 Codex 理解原始语音文本。后续可以让 `command_router.md` 真正参与：

```json
{
  "intent": "summarize_current_note",
  "needs_write": true,
  "risk_level": "low",
  "target": "current_note"
}
```

这样安全策略会更精准，不会把“不要修改任何文件”也因为出现“修改”两个字判成 medium。

#### 12.3 快捷键和 push-to-talk

现在 Obsidian 里可以给命令绑定快捷键，但 Python 侧还不是持续监听 push-to-talk。更理想的交互：

```text
按住快捷键 → 录音
松开快捷键 → 识别并执行
```

#### 12.4 Live2D / 桌面形象

当前架构已经预留状态文件。Live2D 端只需要监听：

```text
_ai-assistant/avatar/state.json
```

然后切换表情和动作。

---

### 十三、关键决策记录

| 决策 | 选择 | 原因 |
|---|---|---|
| 插件工程 | 直接写 `main.js` | 小插件更容易审计，改完直接 reload |
| 语音链路 | Python 实现 | 录音、STT、TTS、本地模型更适合 Python |
| STT 默认 | OpenAI STT | 先保证 MVP 稳定跑通 |
| STT 备用 | faster-whisper | 给离线和隐私场景留入口 |
| TTS | Edge TTS + Windows SAPI | 中文自然，且有系统兜底 |
| 执行层 | Codex CLI | 直接在 vault 中执行，和 Claudian 工作流一致 |
| 当前笔记 | `current-note.json` 桥接 | Obsidian 插件写，Python 读，低耦合 |
| 虚拟形象 | `state.json` 预留 | 先跑通状态，再做 UI / Live2D |
| 高风险操作 | YES 确认 | 防止语音误触导致误删误改 |
| 测试方式 | 合成语音集成测试 | 避免真实麦克风无人输入导致不稳定 |

---

### 十四、v0.2：常驻进程与手动录音控制

第一版的问题很明显：每次点击语音命令都会重新启动 Python，再导入依赖、初始化流程、固定录音 6 秒。真实使用时体感很差：

```text
点击按钮
  → 等 Python 启动
  → 等依赖 import
  → 固定录音 6 秒
  → 才进入 STT
```

v0.2 改成：

```text
Obsidian 插件加载
  → 启动一次常驻 Python HTTP server
  → 用户打开控制面板
  → 点击“开始录音”
  → 自己说完后点击“停止并识别”
  → 检查/编辑转写文本
  → 执行或 dry-run
```

#### 14.1 Python server 模式

新增 CLI：

```powershell
python _ai-assistant\assistant.py server --host 127.0.0.1 --port 17345
```

配置：

```yaml
server:
  host: "127.0.0.1"
  port: 17345
```

server 使用标准库：

```python
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
```

没有引入 FastAPI / Flask，原因是这个 server 只在本机给 Obsidian 插件调用，接口很少，用标准库足够。

接口：

| Endpoint | 作用 |
|---|---|
| `GET /health` | 检查常驻进程是否在线 |
| `POST /record/start` | 开始录音 |
| `POST /record/stop` | 停止录音，只保存 wav |
| `POST /record/stop-transcribe` | 停止录音并调用 STT |
| `POST /run-text` | 执行转写文本 |
| `POST /shutdown` | 停止常驻进程 |

#### 14.2 录音从 `sd.rec(seconds)` 改为 `InputStream`

旧实现：

```python
audio = sd.rec(int(seconds * sample_rate), samplerate=sample_rate, channels=1, dtype="float32")
sd.wait()
sf.write(str(output), audio, sample_rate)
```

它的问题是：录音长度必须预先决定。

新实现是 `ManualRecorder`：

```python
class ManualRecorder:
    def start(self):
        self.chunks = []
        self.stream = sd.InputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype="float32",
            callback=callback,
        )
        self.stream.start()

    def stop(self):
        self.stream.stop()
        self.stream.close()
        audio = np.concatenate(chunks, axis=0)
        sf.write(str(output), audio, self.sample_rate)
```

关键点：

- `start()` 只打开流，不知道录多久。
- callback 持续把音频 chunk append 到内存。
- `stop()` 时才拼接并写入 `last.wav`。
- 这样 UI 就可以精确控制开始和结束。

#### 14.3 非交互确认改造

旧 CLI 可以 `input("如果确认执行，请输入 YES：")`。

HTTP server 不能卡在 stdin，所以 `/run-text` 改成两段式：

```text
POST /run-text confirmed=false
  → 如果 risk != low，返回 requires_confirmation

Obsidian 弹确认框

POST /run-text confirmed=true
  → 真正执行
```

这保留了原来的安全边界，同时避免 server 线程卡死在 `input()`。

#### 14.4 Obsidian 插件控制面板

左侧麦克风现在不再直接开始固定 6 秒录音，而是打开 `VoiceControlModal`。

面板按钮：

```text
启动/检查常驻进程
开始录音
停止并识别
Dry run 执行文本
执行文本
关闭
```

插件通过 Node `http.request` 调本地 server：

```javascript
requestJson(method, pathname, body) {
  const req = http.request({
    hostname: this.settings.serverHost,
    port: this.settings.serverPort,
    path: pathname,
    method,
    timeout: 120000,
  });
}
```

不用 `shell` 拼命令，也不靠 stdout 解析状态；server 返回结构化 JSON。

#### 14.5 常驻进程启动策略

插件设置新增：

```json
{
  "serverHost": "127.0.0.1",
  "serverPort": 17345,
  "autoStartServer": true,
  "stopServerOnUnload": false
}
```

`autoStartServer=true` 时，插件加载后会尝试：

```javascript
this.ensureServer(false)
```

逻辑：

```text
先 GET /health
  ├─ 已在线：复用
  └─ 不在线：spawn python assistant.py server
      └─ 轮询 /health，直到 ready
```

这样避免重复启动多个 server。

#### 14.6 v0.2 测试

server 健康检查：

```powershell
python _ai-assistant\assistant.py server --host 127.0.0.1 --port 17346
GET http://127.0.0.1:17346/health
```

实测返回：

```json
{
  "ok": true,
  "recording": false,
  "current_note": "React-RenderProps-模式笔记.md"
}
```

手动录音接口测试：

```text
POST /record/start
等待约 0.9 秒
POST /record/stop
```

实测写出：

```text
_ai-assistant/audio/input/last.wav
duration_seconds: 0.832
```

这证明录音时长已经不再被固定秒数限制。
