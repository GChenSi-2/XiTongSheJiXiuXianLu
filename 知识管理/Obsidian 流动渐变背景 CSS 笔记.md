---
tags:
  - obsidian
  - css
  - 主题定制
  - 性能优化
created: 2026-04-24
---

# Obsidian 流动渐变背景 CSS 笔记

> 文件位置：`.obsidian/snippets/flowing-bg.css`
> 兼容主题：Minimal（深色模式）

## 概述

在 Obsidian 工作区背景叠加一层**缓慢流动的多色径向渐变**，让纯色深色界面有「呼吸感」。整体设计遵循三个原则：

1. **运动比色彩更醒目** —— 颜色克制，但通过位移/缩放/旋转让动态可被察觉
2. **不抢主角** —— 编辑区与笔记内容始终是视觉重心
3. **零打字卡顿** —— 把昂贵的 `backdrop-filter` 移除，仅在状态栏等小静止区域使用替代方案

---

## 一、文件结构总览

CSS 共分 7 个区块，由上至下：

| # | 区块 | 作用 |
| --- | --- | --- |
| 1 | `body::before` | 渲染流动的多色渐变层（GPU 独立图层） |
| 2 | `body` | 整个工作区的兜底色（深灰蓝） |
| 3 | 中间容器 | 全部透明，让渐变能透到表层 |
| 4 | 编辑/阅读区 | 半透明深色蒙版，比 body 暗一点点 |
| 5 | 侧边栏 | 半透明深底，保证文件列表可读 |
| 6 | 状态栏 | 干净实色 + 顶边线 |
| 7 | 滚动条 | 仅 `:hover` / `:active` 提亮 |

---

## 二、关键技术点

### 2.1 GPU 独立图层加速动画

```css
body::before {
  will-change: transform;
  transform: translateZ(0);
  animation: flow 40s ease-in-out infinite alternate;
}
```

- `will-change: transform` 提示浏览器为该元素**预先分配独立合成图层**
- `transform: translateZ(0)` 强制走 3D 变换路径，触发硬件加速
- 关键帧统一用 `translate3d()` 而非 `translate()`，明确告诉 GPU 走硬件路径

**效果**：动画期间只有那张 GPU 纹理在移动，主页面不会因为背景动画而重绘。

### 2.2 多层径向渐变叠加

```css
background:
  radial-gradient(circle at 20% 30%, rgba(120, 145, 210, 0.34), transparent 45%),
  radial-gradient(circle at 80% 20%, rgba(185, 160, 225, 0.30), transparent 50%),
  radial-gradient(circle at 50% 80%, rgba(135, 195, 205, 0.30), transparent 55%),
  radial-gradient(circle at 90% 70%, rgba(215, 165, 185, 0.26), transparent 45%);
filter: blur(48px) saturate(102%);
```

四个色斑分布在四个角附近：

| 位置 | 颜色 | 含义 |
| --- | --- | --- |
| 左上 (20%, 30%) | `rgba(120, 145, 210)` | 深蓝 |
| 右上 (80%, 20%) | `rgba(185, 160, 225)` | 紫罗兰 |
| 左下 (50%, 80%) | `rgba(135, 195, 205)` | 青绿 |
| 右下 (90%, 70%) | `rgba(215, 165, 185)` | 粉红 |

外层 `filter: blur(48px)` 让色斑边缘融合，整体呈现「极光」感。`saturate(102%)` 微提饱和度避免发灰。

### 2.3 关键帧设计：位移 + 缩放 + 旋转

```css
@keyframes flow {
  0%   { transform: translate3d(0, 0, 0)       scale(1)    rotate(0deg); }
  25%  { transform: translate3d(-6%, 4%, 0)    scale(1.08) rotate(2deg); }
  50%  { transform: translate3d(5%, -5%, 0)    scale(1.05) rotate(-1deg); }
  75%  { transform: translate3d(-3%, -4%, 0)   scale(1.1)  rotate(1.5deg); }
  100% { transform: translate3d(4%, 3%, 0)     scale(1.03) rotate(-0.5deg); }
}
```

三种变换叠加，路径不规则：
- **位移** ±6% —— 平移幅度足够让人看出在动
- **缩放** 1.00 → 1.10 —— 像「呼吸」一样涨缩
- **旋转** ±2° —— 加入微转打破机械感
- **40 秒** + `alternate` —— 来回各 40 秒，整体节奏接近呼吸

---

## 三、性能优化的核心抉择

### 3.1 为什么大面积去掉 `backdrop-filter`

`backdrop-filter` 的代价：**每一帧都要把元素背后的所有像素抓出来 → 模糊/饱和度调整 → 再合成**。

这个开销在两种场景下被放大：

1. **元素面积大**（编辑区、侧边栏） → 每帧处理像素量大
2. **元素内容频繁变化**（`.cm-editor` 打字时持续重绘） → 触发频率高

两者叠加 = 打字明显掉帧。

**解决方案**：

| 区域 | 之前 | 现在 | 理由 |
| --- | --- | --- | --- |
| 编辑区 | `backdrop-filter: saturate(130%)` | 移除，纯 `rgba(0,0,0,0.12)` | 打字区域，每次输入都重绘 |
| 侧边栏 | `backdrop-filter: blur(10px)` | 移除，纯 `rgba(20,22,28,0.50)` | 滚动文件列表持续重绘 |
| 标签栏 / 标题栏 | `backdrop-filter` | 完全移除（交还主题） | 顶部文字图标对比度难调 |
| 状态栏 | `backdrop-filter` | 实色 `rgba(20,23,31,0.92)` + 顶边线 | 小面积，但值得换成实色保稳定 |

### 3.2 `filter: blur` vs `backdrop-filter: blur`

| | `filter: blur` | `backdrop-filter: blur` |
| --- | --- | --- |
| 模糊对象 | **元素自身** | **元素后面的内容** |
| 性能 | 较便宜（只处理自身像素） | 昂贵（每帧抓背后内容） |
| 用途 | 给图片/装饰物做柔化 | 实现「透视磨砂玻璃」 |

`body::before` 用的是 `filter: blur(48px)` —— 模糊**渐变自身**，而不是模糊背后内容，所以性能开销可控。

---

## 四、视觉层级设计

工作区从下到上的「色阶」：

```
背景渐变（流动彩光，最浅）
  ↓
body 底色  #252a35（兜底深灰蓝）
  ↓
中间容器（透明）
  ↓
编辑区蒙版  rgba(0,0,0,0.12)（比 body 暗一点点）
  ↓
侧边栏蒙版  rgba(20,22,28,0.50)（更暗，让文件列表稳）
  ↓
状态栏      rgba(20,23,31,0.92)（最暗，明确底部分隔）
```

**逻辑**：信息越「辅助/边缘」，颜色越深、越退后；笔记内容区作为主角，色调最接近底色，让流动渐变最大限度透上来。

---

## 五、调参速查表

### 5.1 渐变颜色与强度

| 想要的效果 | 改哪里 | 怎么改 |
| --- | --- | --- |
| 颜色更艳 | `body::before` 四条 `rgba()` 末尾 | 各 +0.05（如 0.30 → 0.35） |
| 颜色更淡 | 同上 | 各 -0.05 |
| 整体偏冷 | `saturate(102%)` | 改成 `saturate(90%)` |
| 整体更鲜活 | 同上 | 改成 `saturate(115%)` |
| 换色调（暖/暗） | 四条 `rgba(R, G, B, ...)` | 调 RGB |

### 5.2 运动节奏

| 想要的效果 | 改哪里 | 怎么改 |
| --- | --- | --- |
| 动得更慢 | `animation: flow 40s` | `60s` 或 `90s` |
| 动得更快 | 同上 | `25s` |
| 位移幅度更大（但不加快） | `@keyframes flow` 的 `translate3d` | `±6%` 改成 `±10%` |
| 减少旋转（更平静） | `@keyframes flow` 的 `rotate(...)` | 全部改成 `0deg` |
| 完全不动（静态） | 删除 `animation` 那行 | —— |

### 5.3 编辑区亮度

| 想要的效果 | 改哪里 | 怎么改 |
| --- | --- | --- |
| 编辑区更亮（接近 body） | `rgba(0, 0, 0, 0.12)` | `0.06` 或 `0.04` |
| 编辑区更暗（更沉） | 同上 | `0.20` 或 `0.30` |
| 提亮整个工作区底色 | `body { background-color: ... }` | `#252a35` → `#2c313e` |

### 5.4 状态栏

| 想要的效果 | 改哪里 | 怎么改 |
| --- | --- | --- |
| 状态栏更黑/更沉 | `rgba(20, 23, 31, 0.92)` | `0.96` 或 RGB 整体 -5 |
| 状态栏更轻 | 同上 | `0.80` |
| 顶边线更明显 | `border-top: 1px solid rgba(255,255,255,0.07)` | `0.12` |

### 5.5 滚动条

| 想要的效果 | 改哪里 | 怎么改 |
| --- | --- | --- |
| hover 时更亮 | `*::-webkit-scrollbar-thumb:hover { background-color: ... }` | `0.38` → `0.50` |
| 拖动时更亮 | `*::-webkit-scrollbar-thumb:active { background-color: ... }` | `0.60` → `0.80` |

---

## 六、与其他 snippet 的关系

| Snippet | 角色 | 与本文件的关系 |
| --- | --- | --- |
| `flowing-bg.css` | 工作区流动渐变 | 本文件，z-index `-2`（最底层） |
| `red-butterfly.css` | 飞舞的暗红蝴蝶 | 在 `body::after`，z-index `-1`（在渐变之上） |
| `pdf-frosted.css` | PDF 阅读器磨砂背景 | 独立作用域，互不干扰 |

**叠加顺序**：`body::before`（渐变）→ `body::after`（蝴蝶）→ 中间容器 → 编辑区。

> 注：`body::before` 的 `z-index: -2` 是为了让它在蝴蝶之下，否则 `filter: blur(48px)` 会模糊掉蝴蝶。

---

## 七、常见问题排查

### Q1：snippet 启用后看不到任何变化
1. 检查 `.obsidian/appearance.json` 中 `enabledCssSnippets` 是否包含 `flowing-bg`
2. 确认深色模式（浅色模式下 body 底色被覆盖时效果失真）
3. 按 `Ctrl + R` 强制刷新窗口

### Q2：仍然有打字卡顿
- 确认本文件中**没有任何 `backdrop-filter`** 在 `.cm-editor` / `.cm-scroller` 上
- 检查是否还有其他 snippet 在编辑区加了滤镜
- 极端情况：把 `body::before` 的 `filter: blur(48px)` 改成 `blur(30px)`，模糊半径与计算量呈平方关系

### Q3：在某些主题下渐变完全看不到
- Minimal 之外的主题可能给 `.workspace` 系列容器加了不透明背景
- 检查第 3 区块的容器列表是否需要补充新主题的容器名
- 可在 DevTools 中用 `Ctrl + Shift + I` 查看是哪个元素挡住了 body::before

---

## 八、设计回顾

这套 CSS 经历了多轮迭代，关键决策记录：

1. **渐变载体从 `.workspace::before` 移到 `body::before`**
   - 原因：Minimal 给 `.workspace` 加了不透明背景，渐变被挡住
   - 教训：渐变应该放在 DOM 树最底层

2. **去掉所有顶部栏（标题栏/标签栏/工具栏）的自定义样式**
   - 原因：和 Minimal 主题的默认样式冲突，对比度难调
   - 教训：尊重主题的设计语言，不要无谓覆盖

3. **`backdrop-filter` 大规模移除**
   - 原因：编辑区使用 `backdrop-filter` 导致打字明显掉帧
   - 教训：`backdrop-filter` 只该用在小面积、低重绘频率的元素上

4. **状态栏「假磨砂」方案被否决**
   - 尝试过用 `linear-gradient` 模拟磨砂玻璃的色彩透出感，被判定「不专业」
   - 最终采用纯实色设计，借鉴 VS Code/Figma/Linear 的状态栏哲学

---

## 参考

- [CSS `will-change` MDN 文档](https://developer.mozilla.org/zh-CN/docs/Web/CSS/will-change)
- [CSS `backdrop-filter` 性能分析](https://web.dev/articles/css-performance)
- Obsidian CSS 变量参考：`.obsidian/themes/Minimal/manifest.json`
