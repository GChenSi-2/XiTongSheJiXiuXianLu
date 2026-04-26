# Vault 约定

## 语言偏好
- **所有笔记一律使用「简体中文」** 撰写（包括正文、标题、表格、引用语等）。
- 保留英文专有名词和代码（如 `fork()`、System Call、Trap Table 等）。
- 不要使用繁体中文。

## 图标约定（obsidian-icon-folder 插件）
- 本 vault 使用 `obsidian-icon-folder` 插件为文件 / 文件夹设定图标，配置文件：`.obsidian/plugins/obsidian-icon-folder/data.json`。
- 图标使用 Obsidian **自带的 Lucide 图标集**，命名格式 `LiXxx`（如 `LiCpu`、`LiGitFork`、`LiShieldCheck`）。可浏览 <https://lucide.dev/icons/> 找名字，前缀加 `Li` 即可。
- **每次创建新笔记时，必须**：
  1. 根据笔记主题挑选一个贴切的 Lucide 图标。
  2. 在 `data.json` 中添加一行 `"相对路径.md": "LiXxx",`。
  3. 与同目录 / 同系列的笔记风格保持协调（例如 OSnote 下的章节笔记沿用章节主题对应的概念图标）。
- 已有的惯例：
  - `OSnote/` 文件夹本身 → `LiGraduationCap`
  - 第 4 章（The Process） → `LiCpu`
  - 第 5 章（fork/exec/wait） → `LiGitFork`
  - 第 6 章（Limited Direct Execution） → `LiShieldCheck`
- 文件夹图标也可以设，格式同上（键写文件夹路径，不带 `.md`）。
