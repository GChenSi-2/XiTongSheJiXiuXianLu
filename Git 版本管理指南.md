---
tags:
  - git
  - 工具
  - 版本管理
---

# Git 版本管理指南

本笔记介绍如何用 Git 管理 Obsidian vault，包括本地操作、远程同步和 Obsidian Git 插件的使用。

---

## 一、基础概念

### 三个区域

Git 将代码分为三个区域：

| 区域 | 说明 | 操作 |
|------|------|------|
| **工作区** | 本地文件夹（你正在编辑的笔记） | 直接编辑文件 |
| **暂存区** | 等待提交的更改 | `git add` |
| **提交区** | 已保存的历史版本 | `git commit` |

### 基本流程

```
编辑文件 → git add → git commit → git push → GitHub
(工作区)    (暂存区)   (提交区)    (远程)
```

---

## 二、本地操作

### 检查状态

```bash
# 查看哪些文件被修改了
git status

# 查看修改了什么内容（详细对比）
git diff

# 查看历次提交记录
git log --oneline -10  # 显示最近 10 条
```

### 提交变更

```bash
# 方法一：逐步提交（推荐）
git add .                           # 暂存所有更改
git commit -m "提交信息（中文）"    # 提交

# 方法二：快速提交（一步到位）
git commit -am "更新笔记"  # 仅适用于已跟踪的文件
```

### 撤销操作

```bash
# 撤销对工作区的修改（危险！）
git checkout -- filename

# 将暂存区的文件移出（不删除文件内容）
git reset filename

# 撤销上一次提交（保留修改内容）
git reset --soft HEAD~1

# 彻底撤销上一次提交（删除修改内容）- 谨慎使用！
git reset --hard HEAD~1
```

---

## 三、远程操作

### 查看远程仓库

```bash
# 查看远程仓库列表
git remote -v

# 查看远程仓库详情
git remote show origin
```

### 推送到 GitHub

```bash
# 首次推送（建立跟踪关系）
git push -u origin main

# 日常推送
git push

# 强制推送（覆盖远程，谨慎使用！）
git push --force origin main
```

### 拉取远程更新

```bash
# 获取最新代码
git pull

# 等同于
git fetch origin main && git merge origin/main
```

---

## 四、分支操作

### 创建和切换分支

```bash
# 创建新分支
git branch feature/feature-name

# 切换分支
git checkout feature/feature-name

# 一步创建并切换
git checkout -b feature/feature-name

# 查看所有分支
git branch -a
```

### 合并分支

```bash
# 切到 main 分支
git checkout main

# 合并其他分支
git merge feature/feature-name

# 删除已合并的分支
git branch -d feature/feature-name
```

---

## 五、Obsidian Git 插件使用

### 安装和配置

1. **打开插件市场**：`Ctrl+P` → 搜索 `Browse community plugins`
2. **搜索** `Obsidian Git`，安装并启用
3. **配置认证**：
   - 插件设置 → `Authentication/Commit Author`
   - 填入你的 GitHub 用户名和邮箱

### 快捷操作

#### 手动提交

```
Ctrl+P → 搜索 "Obsidian Git: Commit all changes"
```

或者在 Obsidian 设置里为下列命令设置快捷键：

| 命令 | 功能 |
|------|------|
| `Obsidian Git: Commit all changes` | 提交所有更改 |
| `Obsidian Git: Push` | 推送到远程 |
| `Obsidian Git: Pull` | 拉取远程更新 |
| `Obsidian Git: Create backup` | 手动备份 |

#### 自动备份（推荐）

在插件设置中启用：

- **Backup interval (minutes)**：设置为 `5` 或 `10`（推荐）
  - 每隔 5-10 分钟自动提交一次更改
  
- **Auto push after backup**：启用
  - 提交后自动推送到 GitHub

- **Auto pull interval (minutes)**：设置为 `0`（禁用）或留空
  - 可选，防止频繁拉取导致冲突

### 查看历史

在 Obsidian 左侧边栏会出现 "Obsidian Git" 面板，可以：

- 查看最近提交
- 查看修改的文件列表
- 快速访问 GitHub 仓库

---

## 六、日常工作流

### 场景 1：每天写笔记，定期备份

**推荐方案**：启用 Obsidian Git 自动备份

- 设置自动提交间隔为 5-10 分钟
- 自动推送到 GitHub
- 完全无需手动操作

### 场景 2：手动管理提交（精细化）

```bash
# 编辑完一些笔记后
git status                    # 检查修改

# 分别提交不同类型的改动
git add OSnote/               # 只暂存 OSnote 文件夹
git commit -m "学习笔记：第4章进程"

git add React*.md             # 只暂存 React 相关
git commit -m "React 组件设计模式"

git push                       # 一次性推送所有提交
```

### 场景 3：多设备同步

**情形**：在工作室电脑和笔记本间同步

```bash
# 在新电脑上首次拉取
git clone https://github.com/GChenSi-2/XiTongSheJiXiuXianLu.git
cd XiTongSheJiXiuXianLu

# 每次开始工作前
git pull

# 每次结束工作后
git push
```

---

## 七、提交信息规范

### 良好的提交信息示例

```
✅ 好的示例：
git commit -m "学习笔记：第5章进程 API（fork/exec/wait）"
git commit -m "React 组件拆分：容器组件与展示组件"
git commit -m "修复：Tooltip 组件定位计算bug"

❌ 不好的示例：
git commit -m "update"
git commit -m "fix"
git commit -m "lalala"
```

### 提交信息模板（可选）

```
<类型>: <简短描述>

<详细说明（可选）>

示例类型：
- feat: 新功能或笔记
- fix: 修复错误
- docs: 文档更新
- refactor: 笔记重组
```

---

## 八、常见问题

### Q1：我改错了怎么办？

**回答**：取决于是否已推送

```bash
# 还没 push，在本地修改
git reset --soft HEAD~1    # 撤销上一次提交，保留修改
git add .
git commit -m "修正后的信息"

# 已经 push 到 GitHub，创建新提交修正
git add .
git commit -m "修正：之前的错误"
git push
```

### Q2：两台电脑都改了同一个文件，怎么合并？

**回答**：Git 会自动合并，通常不冲突

```bash
# 电脑 B 拉取电脑 A 的更新
git pull

# 如果有冲突，打开冲突文件手动选择要保留的内容
# 然后提交
git add .
git commit -m "合并冲突"
git push
```

### Q3：能不能删除某个提交的历史？

**回答**：不建议删除已推送的提交（会破坏历史）

如果一定要删除，用 `git rebase` 或 `git reset --hard`，但要谨慎，可能丢失数据。

### Q4：`.gitignore` 为什么不生效？

**回答**：文件已被追踪了

```bash
# 从 Git 中移除已追踪的文件（但保留本地文件）
git rm --cached filename
git commit -m "从版本管理中移除 filename"
```

### Q5：如何查看某个文件的修改历史？

```bash
# 查看文件的所有提交
git log -- filename

# 查看文件每一行的修改者和时间
git blame filename

# 查看某个版本的文件内容
git show commit_hash:filename
```

---

## 九、本 Vault 的 Git 配置

### `.gitignore` 排除项目

当前 vault 的 `.gitignore` 排除了：

| 项目 | 原因 |
|------|------|
| `.obsidian/workspace.json` | 每次打开 Obsidian 都会变，无需追踪 |
| `.obsidian/workspaces.json` | 打开面板状态（高频变动） |
| `.claudian/sessions/` | AI 对话历史 |
| `.obsidian/plugins/text-extractor/cache/` | 自动生成的缓存 |
| `.smart-env/multi/` | 向量索引缓存 |

### 远程仓库配置

```bash
# 查看当前配置
git remote -v

# 输出应该是：
# origin  https://github.com/GChenSi-2/XiTongSheJiXiuXianLu.git (fetch)
# origin  https://github.com/GChenSi-2/XiTongSheJiXiuXianLu.git (push)
```

---

## 十、速查表

### 常用命令一览

```bash
# 本地查看
git status              # 查看状态
git log                 # 查看历史
git diff                # 查看修改

# 本地操作
git add .               # 暂存所有
git commit -m "msg"     # 提交
git reset HEAD~1        # 撤销上一次提交

# 远程操作
git push                # 推送
git pull                # 拉取
git clone URL           # 克隆仓库

# 分支操作
git checkout -b name    # 创建分支
git merge name          # 合并分支
git branch -d name      # 删除分支
```

---

## 参考资源

- [Git 官方文档](https://git-scm.com/doc)
- [Obsidian Git 插件文档](https://github.com/denolehov/obsidian-git)
- [Atlassian Git 教程](https://www.atlassian.com/git)

---

**最后提醒**：Good commits = Good history = Better collaboration! 📝
