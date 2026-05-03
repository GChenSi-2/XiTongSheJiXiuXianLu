# Obsidian AI 虚拟形象语音助手 MVP

这是 [[AI虚拟形象语音助手设计]] 的本地实现。当前主线是 v0.2：**常驻 Python server + Obsidian 控制面板手动开始/停止录音**。

当前版本目标：

```text
Obsidian 控制面板
  → 手动开始录音
  → 手动停止并识别
  → 检查/编辑转写文本
  → Codex 在当前 vault 执行
  → 简短 TTS 播报
```

## 1. 安装依赖

在 vault 根目录运行：

```powershell
cd "C:\Users\user\Desktop\operation system"
python -m pip install -r _ai-assistant\requirements.txt
```

也可以直接双击或运行：

```powershell
_ai-assistant\setup.cmd
```

如果之后要启用本地 faster-whisper：

```powershell
python -m pip install -r _ai-assistant\requirements-whisper.txt
```

## 2. 配置 OpenAI API Key

OpenAI STT 需要环境变量：

```powershell
$env:OPENAI_API_KEY="你的 API key"
```

如果要永久配置，请写入 Windows 用户环境变量。

## 3. 常用命令

### 3.1 测试语音播报

```powershell
python _ai-assistant\assistant.py say "你好，我是你的 Obsidian 语音助手。"
```

### 3.2 录音

```powershell
python _ai-assistant\assistant.py record --seconds 5
```

### 3.3 转写音频

```powershell
python _ai-assistant\assistant.py transcribe _ai-assistant\audio\input\last.wav
```

### 3.4 直接用文本命令测试 Codex 执行

建议先从安全的只读/追加类任务开始：

```powershell
python _ai-assistant\assistant.py run-text "总结当前笔记，不要覆盖原文，只在文末追加一个 AI 总结小节。"
```

### 3.5 启动常驻 server

```powershell
python _ai-assistant\assistant.py server
```

或者使用 `.cmd` 包装器：

```powershell
_ai-assistant\start-server.cmd
```

常驻 server 默认监听：

```text
http://127.0.0.1:17345
```

插件加载时会自动尝试启动它，通常不需要你手动运行。

### 3.6 旧版固定时长语音流程

旧 CLI 流程仍保留，主要用于排查问题：

```powershell
python _ai-assistant\assistant.py voice --seconds 6
```

或者：

```powershell
_ai-assistant\voice.cmd --seconds 6
```

## 4. 切换 STT 后端

默认使用 OpenAI STT：

```yaml
voice:
  stt_provider: "openai"
```

如需本地识别，先安装 `_ai-assistant\requirements-whisper.txt`，然后改为：

```yaml
voice:
  stt_provider: "faster-whisper"
```

## 5. 当前笔记

外部脚本无法天然知道 Obsidian 当前打开哪篇笔记，所以 MVP 使用：

```text
_ai-assistant/current-note.json
```

现在默认写的是：

```text
React-CompoundComponents-模式笔记.md
```

后续可以写一个 Obsidian 插件，让它实时更新这个文件。

## 6. 安全机制

以下类型的命令会要求命令行确认：

- 删除文件
- 移动或重命名文件
- 覆盖原文
- 批量修改
- 修改所有/全部笔记
- 执行 shell 命令

如果你只是测试，请优先使用：

```text
总结当前笔记，不要覆盖原文，只在文末追加。
```

## 7. 当前测试状态

已经验证：

- Python 语法通过。
- 基础依赖可安装。
- Edge TTS 可以生成 MP3。
- 录音可以生成 WAV。
- Codex CLI 可以被脚本调用。
- OpenAI STT 已通过合成语音测试。
- 合成语音 → OpenAI STT → Codex → TTS 总结的集成链路已跑通。

注意：

- OpenAI STT 需要先配置 `OPENAI_API_KEY`；当前脚本会优先读当前进程变量，也会尝试从 Windows User/Machine 环境变量读取。
- faster-whisper 是可选后端，默认没有安装。
- Codex CLI 的 approval 参数必须放在 `exec` 子命令之前，当前脚本已按这个规则处理。

最近一次集成测试：

```text
TTS 生成测试语音命令
→ OpenAI STT 转写
→ Codex 执行安全只读命令
→ TTS 生成成果总结
```

结果：

```text
已完成。已读取当前笔记路径：[[React-CompoundComponents-模式笔记.md]]，未修改任何文件。
```

## 8. Obsidian 插件入口

已创建本地插件：

```text
.obsidian/plugins/ai-voice-assistant/
```

插件采用直接写 `main.js` 的方式，不使用 TypeScript/esbuild。

在 Obsidian 插件列表中显示名称：

```text
AI 语音助手
```

插件 ID：

```text
ai-voice-assistant
```

插件功能：

- 加载插件后启动常驻 Python server，减少每次语音命令的启动等待。
- 左侧 ribbon 麦克风按钮打开语音控制面板。
- 控制面板支持手动“开始录音 / 停止并识别 / 执行文本”，不再固定录音 6 秒。
- 命令面板支持启动常驻 server、开始录音、停止并识别、文本命令、同步当前笔记、打开状态文件、停止当前进程。
- 自动同步当前打开的笔记到 `_ai-assistant/current-note.json`。
- 如果 Python 助手要求输入 `YES`，插件会弹出确认窗口。

启用状态已经写入：

```text
.obsidian/community-plugins.json
```

如果 Obsidian 当前没有立即显示插件，请重启 Obsidian 或按 `Ctrl+R` 重新加载窗口。
