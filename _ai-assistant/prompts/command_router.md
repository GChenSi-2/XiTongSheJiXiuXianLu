将用户语音命令分类为一个 intent。

输出 JSON：

```json
{
  "intent": "summarize_current_note",
  "needs_write": true,
  "risk_level": "low",
  "target": "current_note",
  "confirmation_required": false
}
```

常见 intent：

- summarize_current_note
- organize_current_note
- search_notes
- append_to_daily_note
- create_note
- generate_review_questions
- batch_edit_notes
- unknown

