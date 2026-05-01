# AI 语音助手 Obsidian Plugin

这是本地插件，按“直接写 `main.js`，不走 TypeScript/esbuild”的方式实现。

## 功能

- 插件加载后自动启动一个常驻 Python 助手进程，避免每次语音命令都重新启动 Python。
- 左侧 ribbon 麦克风按钮：打开语音控制面板。
- 控制面板中手动点击“开始录音”和“停止并识别”，不再固定 6 秒。
- 命令面板：
  - `AI 语音助手: Open voice control panel`
  - `AI 语音助手: Start resident assistant server`
  - `AI 语音助手: Start recording`
  - `AI 语音助手: Stop recording and transcribe`
  - `AI 语音助手: Run text command`
  - `AI 语音助手: Sync current note to assistant`
  - `AI 语音助手: Open assistant status file`
  - `AI 语音助手: Open last Codex message`
  - `AI 语音助手: Stop current assistant process`
- 自动把当前打开的笔记同步到 `_ai-assistant/current-note.json`。
- 如果 Python 助手要求输入 `YES`，插件会弹出确认窗口。

## 使用

1. 重启 Obsidian，或使用 `Ctrl+R` 重新加载窗口。
2. 确认第三方插件列表中 `AI 语音助手` 已启用。
3. 打开一篇笔记。
4. 点击左侧麦克风，或从命令面板运行 `AI 语音助手: Open voice control panel`。
5. 点击“开始录音”。
6. 说完后点击“停止并识别”。
7. 检查/编辑转写文本，然后点击“执行文本”或 “Dry run 执行文本”。

## 设置

在插件设置中可调整：

- Python 命令
- Python 助手脚本路径
- 配置文件路径
- 常驻 server host / port
- 是否加载插件时自动启动常驻 server
- 是否卸载插件时停止常驻 server
- 是否自动同步当前笔记
- 是否在任务结束后显示输出日志
- Ribbon 是否默认 dry-run
- Legacy 默认录音秒数：仅旧版固定时长 CLI 流程使用，控制面板录音不依赖它

## 架构变化：v0.2

旧版点击麦克风会启动一次 Python 并固定录音 6 秒。v0.2 改成：

```text
插件加载 → 常驻 Python server
点击麦克风 → 控制面板
开始录音 → 停止并识别 → 编辑转写文本 → 执行
```

本地 server 默认地址：

```text
http://127.0.0.1:17345
```
