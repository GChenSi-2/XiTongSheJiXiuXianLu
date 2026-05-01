---
title: Obsidian AI 虚拟形象语音助手设计
created: 2026-05-01
status: design
tags:
  - obsidian
  - ai-assistant
  - voice
  - claudian
  - codex
---

# Obsidian AI 虚拟形象语音助手设计

## 1. 目标

在当前 Obsidian vault 中搭建一个 **AI 虚拟形象语音助手**：

1. 用户通过语音下达命令。
2. 助手将语音转换为文本。
3. 助手理解命令，并交给 Claudian/Codex 在当前 vault 中执行。
4. 执行完成后，助手用简短中文语音总结结果。
5. 虚拟形象根据状态做出反馈，例如“正在听”“正在思考”“已完成”“出错了”。

核心体验：

> 按下快捷键，说一句话，AI 帮我操作 Obsidian，然后用一句话告诉我结果。

---

## 2. 设计原则

### 2.1 先做可用，再做漂亮

第一阶段优先实现稳定的语音命令链路：

```text
语音输入 → 语音识别 → AI 执行 → 语音总结
```

虚拟形象可以先用简单状态面板代替，等核心流程稳定后再接入 Live2D 或桌面形象。

### 2.2 所有写入操作必须安全

语音命令可能误触，因此必须设置安全边界：

- 删除文件必须二次确认。
- 批量修改文件必须先展示计划。
- 默认只操作当前 vault。
- 每次写入操作都记录日志。
- 语音播报只总结，不朗读大量正文。

### 2.3 详细内容写进 Obsidian，语音只讲摘要

语音总结应保持简短，例如：

```text
已完成。我帮你总结了当前笔记，并追加了三个重点和两个复习问题。
```

不要把完整笔记、完整搜索结果或长篇回答全部读出来。

---

## 3. 总体架构

```text
麦克风
  ↓
语音识别 STT
  ↓
命令理解 / 命令路由
  ↓
Claudian / Codex 执行层
  ↓
结果摘要
  ↓
语音合成 TTS
  ↓
虚拟形象反馈
```

### 3.1 模块说明

| 模块   | 作用                | 推荐技术                     |
| ---- | ----------------- | ------------------------ |
| 语音输入 | 录制用户命令            | Python + 快捷键触发           |
| STT  | 语音转文字             | OpenAI STT / faster-whisper，可配置切换 |
| 命令路由 | 判断用户要做什么          | LLM prompt / 规则优先        |
| 执行层  | 操作 Obsidian vault | Claudian 或 Codex CLI     |
| 摘要层  | 生成简短成果说明          | LLM                      |
| TTS  | 文字转语音             | Edge TTS / OpenAI TTS    |
| 虚拟形象 | 状态反馈              | Obsidian 面板 / Live2D     |

---

## 4. 推荐实现路线

## 4.1 MVP：语音命令 + Codex 执行 + TTS 总结

第一阶段不强求复杂虚拟形象，先实现：

```text
快捷键触发
  → 录音
  → 语音识别
  → 调用 Codex/Claudian 执行
  → 生成一句结果摘要
  → 播放语音
```

### 推荐技术栈

| 功能    | 推荐                                |
| ----- | --------------------------------- |
| 主程序   | Python                            |
| 语音识别  | OpenAI STT 优先，faster-whisper 本地备用 |
| 语音合成  | edge-tts                          |
| AI 执行 | Codex CLI，工作目录设为当前 vault          |
| 日志    | Markdown / JSONL                  |
| 状态显示  | 控制台或简单 Obsidian 状态文件              |

### STT 后端设计

语音识别模块不要和某一个具体实现绑定，而是设计成可插拔后端。

推荐同时支持两个后端：

| 后端 | 优点 | 缺点 | 适合场景 |
|---|---|---|---|
| OpenAI STT | 配置简单，识别质量稳定，省去本地模型环境问题 | 需要网络和 API key | 推荐默认方案 |
| faster-whisper | 可本地运行，隐私性好，长期成本低 | 安装和模型环境可能出问题 | 离线模式 / 备用方案 |

建议默认使用 OpenAI STT。如果 OpenAI STT 不可用、额度不足或网络异常，再切换为 faster-whisper。

这样即使本地 Whisper 环境失败，整个语音助手项目也不会被卡住。

### 为什么第一阶段建议走 Codex CLI

Claudian 在 Obsidian 中使用体验很好，但如果它没有稳定公开的外部 API，外部语音助手直接控制 Claudian 界面会比较脆弱。

因此 MVP 建议采用：

```text
语音助手 → Codex CLI → 当前 Obsidian vault
```

这样可以保证 AI 在同一个 vault 目录中执行任务。

如果之后确认 Claudian 支持外部命令、URI、命令面板参数或插件 API，再把执行层切换到：

```text
语音助手 → Claudian → Codex
```

---

## 5. 目录结构建议

建议在 vault 根目录建立一个工具目录：

```text
_ai-assistant/
  README.md
  config.yaml
  assistant.py
  requirements.txt
  prompts/
    command_router.md
    execution_prompt.md
    result_summarizer.md
  logs/
    assistant.log
    actions.jsonl
  audio/
    input/
    output/
  avatar/
    state.json
    panel.html
```

说明：

| 路径 | 作用 |
|---|---|
| `_ai-assistant/config.yaml` | 统一配置 |
| `_ai-assistant/assistant.py` | 主程序 |
| `_ai-assistant/prompts/` | AI 提示词 |
| `_ai-assistant/logs/` | 操作日志 |
| `_ai-assistant/audio/` | 临时录音和播报音频 |
| `_ai-assistant/avatar/state.json` | 虚拟形象状态文件 |
| `_ai-assistant/avatar/panel.html` | 后续 Obsidian 面板或浏览器面板 |

---

## 6. 配置文件草案

```yaml
vault_path: "."

hotkey:
  mode: "push_to_talk"
  key: "ctrl+alt+space"

voice:
  stt_provider: "openai"
  openai_stt_model: "gpt-4o-mini-transcribe"
  faster_whisper_model: "small"
  language: "zh"
  tts: "edge-tts"
  tts_voice: "zh-CN-XiaoxiaoNeural"
  summary_max_sentences: 2

execution:
  mode: "codex-cli"
  require_confirmation_for_write: true
  require_confirmation_for_delete: true
  max_files_without_confirmation: 3

avatar:
  enabled: true
  mode: "state-file"
  state_file: "_ai-assistant/avatar/state.json"

logging:
  enabled: true
  action_log: "_ai-assistant/logs/actions.jsonl"
```

---

## 7. 语音命令类型设计

### 7.1 当前笔记类

示例语音：

```text
总结当前笔记
整理这篇笔记
给当前笔记生成复习问题
把当前笔记改成更清晰的结构
```

执行策略：

1. 获取当前 note 路径。
2. 读取 note 内容。
3. 生成修改计划。
4. 如果只是追加摘要，可以直接执行。
5. 如果要大幅重写，先要求确认。

### 7.2 搜索类

示例语音：

```text
帮我找和 React Compound Components 相关的笔记
查一下我有没有写过关于 Zustand 的内容
找出最近的 AI 助手设计相关笔记
```

执行策略：

1. 在 vault 中搜索关键词。
2. 返回最相关的笔记列表。
3. 可选：生成一个链接索引 note。

### 7.3 记录类

示例语音：

```text
把我接下来说的话记到今天的 daily note
新建一条灵感笔记
记录一个任务，明天检查语音助手原型
```

执行策略：

1. 识别用户口述内容。
2. 判断写入位置。
3. 追加到 daily note 或 inbox note。
4. 播报简短结果。

### 7.4 任务执行类

示例语音：

```text
帮我把这篇笔记拆成三个小节
根据这篇文章生成 Anki 卡片
帮我把所有 React 笔记加上标签
```

执行策略：

1. 判断是否涉及写入。
2. 判断影响文件数量。
3. 超过阈值时先生成计划。
4. 用户确认后执行。

---

## 8. 命令路由设计

语音识别后的文本先进入命令路由器。

### 8.1 路由输出格式

```json
{
  "intent": "summarize_current_note",
  "needs_write": true,
  "risk_level": "low",
  "target": "current_note",
  "user_text": "总结当前笔记",
  "confirmation_required": false
}
```

### 8.2 常见 intent

| intent                      | 含义     |
| --------------------------- | ------ |
| `summarize_current_note`    | 总结当前笔记 |
| `organize_current_note`     | 整理当前笔记 |
| `search_notes`              | 搜索笔记   |
| `append_to_daily_note`      | 追加到日记  |
| `create_note`               | 创建新笔记  |
| `generate_review_questions` | 生成复习问题 |
| `batch_edit_notes`          | 批量修改笔记 |
| `unknown`                   | 无法判断   |

---

## 9. 虚拟形象状态设计

### 9.1 状态表

| 状态 | 含义 | 表现 |
|---|---|---|
| `idle` | 待机 | 正常表情 |
| `listening` | 正在听 | 眼睛亮起 / 麦克风动画 |
| `transcribing` | 正在识别语音 | 轻微思考动画 |
| `thinking` | AI 正在规划 | 思考表情 |
| `executing` | 正在操作笔记 | 工作中表情 |
| `speaking` | 正在播报 | 嘴型/音频动画 |
| `confirming` | 等待用户确认 | 询问表情 |
| `done` | 已完成 | 开心表情 |
| `error` | 出错 | 困惑表情 |

### 9.2 state.json 示例

```json
{
  "state": "thinking",
  "message": "正在分析当前笔记",
  "updated_at": "2026-05-01T00:00:00+09:00"
}
```

第一阶段可以只写这个状态文件。后续 Obsidian 面板、Live2D 或桌面形象都读取它来切换表现。

---

## 10. 安全机制

### 10.1 风险等级

| 风险 | 示例 | 处理方式 |
|---|---|---|
| low | 总结、搜索、追加小段内容 | 可直接执行 |
| medium | 重写当前笔记、创建多份笔记 | 执行前口头确认 |
| high | 删除、移动、批量修改 | 必须文字确认 + 计划预览 |

### 10.2 强制确认规则

以下命令必须确认：

- 删除文件。
- 移动文件。
- 重命名大量文件。
- 修改超过 3 个文件。
- 覆盖原文。
- 执行 shell 命令。

### 10.3 日志格式

`_ai-assistant/logs/actions.jsonl` 每行记录一次操作：

```json
{
  "time": "2026-05-01T00:00:00+09:00",
  "voice_text": "总结当前笔记",
  "intent": "summarize_current_note",
  "target_files": ["React-CompoundComponents-模式笔记.md"],
  "write_performed": true,
  "summary": "已追加 AI 总结小节"
}
```

---

## 11. MVP 执行流程

```text
1. 用户按下 Ctrl + Alt + Space
2. 助手状态变为 listening
3. 用户说：“总结当前笔记”
4. 录音结束
5. STT 输出：“总结当前笔记”
6. 命令路由器识别 intent
7. 助手状态变为 thinking
8. Codex 在 vault 中执行任务
9. 助手状态变为 speaking
10. TTS 播报：“已完成。我帮你总结了当前笔记，并在文末添加了重点摘要。”
11. 助手状态回到 idle
```

---

## 12. 分阶段实施计划

## 阶段 1：命令行原型

目标：

- 可以录音。
- 可以通过 OpenAI STT 识别中文语音。
- 可以在配置中切换到 faster-whisper。
- 可以把识别结果打印出来。
- 可以播放一段 TTS。

验收标准：

```text
按快捷键说话 → 屏幕显示识别文本 → 播放“我听到了：xxx”
```

补充验收标准：

```text
stt_provider: openai → 使用 OpenAI STT
stt_provider: faster-whisper → 使用本地 faster-whisper
```

## 阶段 2：接入 Codex 执行

目标：

- 语音命令可以转成 Codex 任务。
- Codex 在当前 vault 中读取和修改 Markdown。
- 结果被简短播报。

验收标准：

```text
说“总结当前笔记” → 当前笔记被追加 AI 总结 → 语音播报完成结果
```

## 阶段 3：加入安全确认

目标：

- 中高风险操作先确认。
- 日志记录所有操作。
- 失败时可追踪错误。

验收标准：

```text
说“删除这篇笔记” → 助手不会直接删除，而是要求确认
```

## 阶段 4：加入虚拟形象状态面板

目标：

- Obsidian 或浏览器中显示一个简单 AI 形象。
- 根据 `state.json` 显示不同状态。

验收标准：

```text
说话时显示“正在听”
执行时显示“正在思考”
完成后显示“已完成”
```

## 阶段 5：Live2D / 桌面形象

目标：

- 接入 Live2D 或桌面小助手。
- 播报时有口型变化。
- 不同状态有不同表情。

验收标准：

```text
AI 助手可以像桌面角色一样听命令、说话、反馈状态
```

---

## 13. 后续可扩展能力

### 13.1 唤醒词

例如：

```text
小助理，帮我总结当前笔记
```

但唤醒词会增加误触风险，建议 MVP 稳定后再做。

### 13.2 当前笔记感知

后续可以让 Obsidian 插件把当前 note 路径写入：

```text
_ai-assistant/current-note.json
```

示例：

```json
{
  "path": "React-CompoundComponents-模式笔记.md",
  "updated_at": "2026-05-01T00:00:00+09:00"
}
```

这样外部语音助手就能知道“当前笔记”是哪一篇。

### 13.3 选中文本感知

后续可以让 Obsidian 插件把当前选中文本写入：

```text
_ai-assistant/current-selection.md
```

这样就可以支持：

```text
解释我选中的这段
把选中内容改得更清楚
根据选中内容生成例子
```

### 13.4 主动提醒

例如：

- 每天晚上提醒整理 inbox。
- 每周提醒复习最近创建的笔记。
- 检测长期未整理的草稿。

---

## 14. 推荐下一步

建议下一步先实现以下最小闭环：

```text
录音 → OpenAI STT 识别 → Edge TTS 播报
```

同时保留一个可切换的本地备用链路：

```text
录音 → faster-whisper 识别 → Edge TTS 播报
```

完成后再接入：

```text
识别文本 → Codex 执行 → 简短语音总结
```

最小原型目标：

> 在当前 vault 中运行一个 Python 脚本，按快捷键说“总结当前笔记”，AI 完成操作并用中文说“已完成”。

---

## 15. 关键决策记录

| 决策 | 选择 | 原因 |
|---|---|---|
| 第一阶段形象 | 简单状态面板 | 降低复杂度 |
| 第一阶段语音触发 | 快捷键 | 比唤醒词稳定 |
| 第一阶段执行方式 | Codex CLI 优先 | 比自动控制 Claudian UI 更稳定 |
| 第一阶段 STT | OpenAI STT 默认，faster-whisper 备用 | 避免本地 Whisper 环境失败卡住 MVP |
| 语音总结长度 | 1-2 句 | 避免打断思考 |
| 高风险操作 | 必须确认 | 防止误删和误改 |
