---
tags: [obsidian, css, pdf, minimal-theme]
created: 2026-04-29
---

# Obsidian PDF 磨砂背景定制笔记

> 记录把 PDF 查看器的纯黑背景改成「工作区磨砂玻璃」效果的完整调试过程，包含失败的弯路和最终方案。

## 目标效果

- PDF 外层背景：透明，让工作区流动渐变透出
- PDF 页面边界：清晰可见（卡片化）
- PDF 文字：保持可读
- 整体观感：磨砂玻璃，与工作区融为一体

## 环境

| 项目 | 值 |
|---|---|
| 主题 | Minimal |
| 配色方案 | `minimal-dark-tonal` + `minimal-ayu-dark` |
| 模式 | 深色（`theme-dark`）|
| 已启用 | `pdf-invert-dark`、`pdf-blend-light`、`pdf-seamless-on` |
| 工作区背景 | [[.obsidian/snippets/flowing-bg.css]] 流动渐变片段 |

## 弯路（务必绕开）

### ❌ 弯路 1：以为类名是 `.pdf-page`

源码 grep 出来的字符串里有 `.pdf-page`，但**这是 PDF 嵌入场景（embed）的类**。
独立窗口打开的 PDF 用的是 PDF.js 标准类名 `.page`，外面包 `.pdfViewer`。

> **教训**：不要相信源码 grep 出来的类名，**一定要在 DevTools 里实地查 DOM**。

### ❌ 弯路 2：覆盖 `--pdf-page-background` 变量

源码确实有这条逻辑：
```js
this.ctx.fillStyle = s || "#ffffff";  // s = getCssPropertyValue("--pdf-page-background")
this.ctx.fillRect(0, 0, n, o);
```

我设了 `--pdf-page-background: rgba(26, 29, 37, 0.55)`，DevTools 里也确认变量被正确覆盖到所有层。**但 PDF 仍然纯黑**。

原因：用户启用了 Minimal 的 `pdf-invert-dark`，**Minimal 用 CSS filter 做反转**，根本不走 `--pdf-page-background` 这条路：

```css
/* Minimal 自带的规则 */
.theme-dark.pdf-invert-dark .canvasWrapper {
  filter: invert(1) hue-rotate(180deg);
  mix-blend-mode: screen;
}
```

> **教训**：源码逻辑只是**之一**的可能机制，主题可能用完全不同的方式覆盖。

### ❌ 弯路 3：在 canvas 上用 `mix-blend-mode: screen`

理论：黑色 (0,0,0) screen 任意色 = 任意色，能让黑色透明化。

实际：`mix-blend-mode: screen` 需要**下层有亮色**才能"提亮"。
- 工作区底色 `#1a1d25`（暗）→ screen 提亮后还是暗
- 视觉效果几乎是纯黑

> **教训**：`screen` 不是万能透明化，是「亮加亮」混合。下层必须够亮。

## ✅ 最终方案（极致透明 + textLayer 接管）

### 演化路径

```
方案 A：backdrop-filter 磨砂玻璃
  ❌ 掉帧严重，性能差

方案 B：依赖 Minimal 的 mix-blend-mode: screen
  ❌ 工作区底色 #1a1d25 太暗，screen(0黑, 暗) ≈ 暗，渐变提不出来

方案 C（最终）：覆盖 Minimal，用 canvas opacity 直接透 + textLayer 接管文字
  ✓ 工作区渐变成为主视觉
  ✓ 文字由 textLayer 显示真实白字（带描边）
  ✓ 性能好（仅一层 opacity，无 blend / blur）
```

### 核心思路

```
工作区流动渐变（body::before）
        ↑ 真实穿透 100%
.canvasWrapper（opacity: 0）   ← canvas 完全隐藏
.textLayer（color: white）     ← 文字唯一来源
最终视觉：渐变背景 + 锐利白字，无任何重影 / 错位
```

### 关键 CSS 片段

```css
/* 1. canvas 完全隐藏，避免与 textLayer 重影 */
html body .canvasWrapper {
  opacity: 0 !important;
}

/* 2. textLayer 接管文字显示
   PDF.js 默认让 .textLayer 透明（仅作选择层），
   这里强制白字让它成为唯一可见文字层 */
html body .pdfViewer .page .textLayer {
  opacity: 1 !important;
}

html body .pdfViewer .page .textLayer span {
  color:                   rgba(255, 255, 255, 0.95) !important;
  -webkit-text-fill-color: rgba(255, 255, 255, 0.95) !important;
}
```

### ⚠️ 副作用：图片 / 图表 / 公式不可见

PDF 的非文字内容（图片、表格线、公式渲染）都画在 canvas 上，不在 textLayer 里。
canvas opacity: 0 = 这些内容也一起隐形。

**应对方案**：遇到关键图的页面，临时把 `opacity: 0` 调到 `0.5+`（DevTools 实时调，或编辑片段后重载）。

### 关键洞察：PDF.js 的双层文字结构

PDF.js 渲染时把文字「画」两次：

| 层级 | 默认状态 | 用途 |
|---|---|---|
| `canvas` | 不透明黑字 | 视觉显示 |
| `.textLayer span` | `color: transparent` | 选择 / 拷贝（位置精确对齐 canvas）|

**关键点**：textLayer 的字体、字号、位置、行距由 PDF.js 自动算好对齐 canvas，
我们只要把它从 `color: transparent` 改成可见，就能直接拿来当显示层。

→ **canvas 可以无限透明，文字始终清晰**。

### 调参指南

只需改 `opacity` 一个值（第 38 行附近）：

| 值 | 效果 |
|---|---|
| `0.50` | canvas 仍可见，渐变隐约，文字会重影 |
| `0.22` | 渐变明显，canvas 文字浅灰，仍有轻微重影 |
| **`0`** | **当前**：canvas 完全消失，仅 textLayer 显示文字，无重影 ★ |
| 临时 `0.5+` | 查看图片 / 图表时临时调高 |

完整片段见 [[.obsidian/snippets/pdf-frosted.css]]。

> ⚠️ **被废弃的方案**：
> - **方案 A**：`backdrop-filter: blur(32px)`，磨砂效果好，但滚动重绘掉帧
> - **方案 B**：依赖 Minimal 的 `mix-blend-mode: screen`，本以为黑色是 screen 恒等元能透色，但 `screen(0, 暗工作区) = 暗` —— 暗 × 暗仍然暗，提不出可见亮度

## 🎯 进阶方案：源头控制 `--pdf-page-background`（推荐）

之前都是"事后处理"——canvas 已经画完白底了，再用 filter / blend 修补。
**更根源的方案**：直接告诉 PDF.js"画 canvas 时用透明色填底"，从源头省掉所有补救。

### 工作原理

PDF.js 在 canvas 上绘制时，第一步是 fillRect 整个画布做底色：

```js
this.ctx.fillStyle = s || "#ffffff";    // s = getCssPropertyValue("--pdf-page-background")
this.ctx.fillRect(0, 0, n, o);          // 用这个颜色填整个 canvas
// 然后才开始画 PDF 文字 / 图形
```

只要 `--pdf-page-background` 是 `transparent` 或带 alpha 的 rgba，
canvas 自身的"背景"就是透明的，工作区直接从画布里透出来。
**不需要 filter+screen，也没有文字重影问题。**

### 启用前提：`pdfjs-is-themed` 必须为 true

源码门控逻辑：

```js
a = t.loadLocalStorage("pdfjs-is-themed");   // 这就是开关
s = null;
a && (
  o.addClass("mod-themed"),
  s = getCssPropertyValue("--pdf-page-background"),  // 只有 a 为真才读
  l = document.body.hasClass("theme-dark")           // pageInvert 也跟着启用
);
```

未启用时：`s = null` → fillStyle = "#ffffff" → 强制白底。
启用时：`s = --pdf-page-background` → 我们设的颜色生效。

UI 上的开关在 PDF 工具栏的调色板按钮（lucide-palette 🎨）→「适配主题 / Adapt to theme」。

### Minimal 用户的坑：工具栏可能被隐藏

如果 Minimal Settings 启用了 **`pdf-seamless-on`**（无缝 PDF），
PDF 顶部工具栏会被隐藏，找不到那个调色板按钮。

**绕开方法**：直接用 DevTools Console 设 localStorage 标志：

```javascript
app.saveLocalStorage('pdfjs-is-themed', 'true');
// 然后 Ctrl+R 重启 Obsidian
```

关闭：

```javascript
app.saveLocalStorage('pdfjs-is-themed', null);
```

### CSS 写法

```css
/* 全局设置 PDF 画布底色 */
:root,
html body,
html body.theme-dark {
  --pdf-page-background: rgba(0, 0, 0, 0.30) !important;
}
```

调透明度只要改 alpha 这一个值，不需要碰 filter / blend / opacity。

### 验证脚本

```javascript
const c = document.querySelector('.pdf-container');
console.log('mod-themed:', c.classList.contains('mod-themed'));         // 必须 true
console.log('localStorage:', localStorage.getItem('pdfjs-is-themed'));   // 必须 'true'
console.log('--pdf-page-background:',
  getComputedStyle(c).getPropertyValue('--pdf-page-background').trim()  // 必须是我们设的值
);
```

### 这个方案 vs 事后 filter+blend 方案

| 维度 | 事后 filter+blend | 源头 `--pdf-page-background` |
|---|---|---|
| 概念 | canvas 画完白底再修补 | 直接告诉 PDF.js 用透明底画 |
| CSS 量 | 多个 filter / blend / opacity | 一个 CSS 变量 |
| 文字双层风险 | 有（textLayer vs canvas 字形）| 无（canvas 自己就是透明的）|
| 性能 | filter / blend 有合成开销 | canvas 像素天生 alpha 通道 |
| 前提 | 无（任何状态都能用）| 必须启用 `pdfjs-is-themed` |
| 推荐度 | 应急 / 不想动 PDF 设置 | ★ 推荐 |

### 关键洞察：CSS 变量是"双向门户"

`--pdf-page-background` 不仅是给 CSS 看的，**JS 也会反向读它**（`getCssPropertyValue`）。
这种"CSS 变量 + JS 读取"的设计模式在 Obsidian 内核很常见：
- `--pdf-page-background` → PDF.js 渲染色
- `--accent-color` → 各种 accent 元素读取
- `--font-text` → 编辑器字体

→ **遇到内核渲染相关的可调内容，先 grep `getCssPropertyValue` 找有没有 CSS 变量门户**。

## 🔬 终极方案：SVG chroma-key 真·alpha 透明

`--pdf-page-background` 解决了"PDF.js 主动用什么色填底"，但没解决"PDF 内容自带的白色页面背景"——那部分白色是 PDF 文件本身画进 canvas 的，不在我们控制内。

`mix-blend-mode: screen` 是常见解法（黑色 = 显示下层），但有个**致命局限**：被 stacking context 锁死。

### 决定性观察（用户实测）

```
canvas 用 opacity 调透明 → 工作区 body::before 流动渐变能透出来 ✓
canvas 用 mix-blend-mode: screen → 渐变完全透不出，PDF 区域纯黑 ✗
```

**原因**：PDF.js 的 `.page` 因为 `transform` / `z-index` / `position` 等属性创建了 stacking context。
- `mix-blend-mode` 的 backdrop **被锁死在最近的 stacking context 内**
- `opacity` 是 alpha-compositing，**在像素层穿透所有 stacking context**

→ screen blend 实际只是和 `.page` 内部的"虚空"混合，完全到不了底层渐变。

### 解法：SVG `feColorMatrix` 直接改 alpha

不用 `mix-blend-mode`，改用 SVG 滤镜把"白底"的 alpha 通道直接设为 0：

```css
html body .canvasWrapper {
  filter: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><filter id="k"><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  1 1 1 0 0"/></filter></svg>#k') !important;
  mix-blend-mode: normal !important;
  opacity:        1 !important;
}
```

### 矩阵原理

`feColorMatrix` 是 4×5 矩阵，行依次代表新的 R / G / B / A，每行 5 列对应原 [R, G, B, A, 1]：

```
| R' |   | 1 0 0 0 0 |   | R |
| G' | = | 0 1 0 0 0 | × | G |
| B' |   | 0 0 1 0 0 |   | B |
| A' |   | 1 1 1 0 0 |   | A |
                          | 1 |
```

- 颜色不变（前三行单位映射）
- **`A' = R + G + B`**（彩度作为 alpha，clamp 到 [0,1]）

代入：

| 像素 | RGB | A' | 结果 |
|---|---|---|---|
| 黑色（PDF 反转后的白底）| (0, 0, 0) | 0 | 完全透明 ✓ |
| 白色（PDF 反转后的文字）| (1, 1, 1) | 3 → 1 | 完全不透明 ✓ |
| 灰阶过渡像素（抗锯齿）| (0.5, 0.5, 0.5) | 1.5 → 1 | 不透明 |
| 深灰（轻反转的边缘）| (0.2, 0.2, 0.2) | 0.6 | 半透明（保留抗锯齿）✓ |

### 为什么这次能透到 body::before

```
canvas 像素 → feColorMatrix 处理 → 部分像素 alpha=0
        ↓
浏览器原生 alpha-compositing（**不关心 stacking context**）
        ↓
.page 当前层（透明部分继续传透）
        ↓
.pdfViewer / .pdf-container ...
        ↓
body 背景 #252a35
        ↓
body::before 流动渐变 ← ★ 终于到达了
```

alpha=0 是像素属性，合成阶段直接穿透；不像 `mix-blend-mode` 是"层间混合"，受 stacking 限制。

### 三种透明方案对比

| 维度 | `mix-blend-mode: screen` | `opacity: 0.X` | SVG `feColorMatrix` chroma-key |
|---|---|---|---|
| 透明机制 | screen 数学混合 | 整体 alpha 缩放 | 选择性 alpha 改写 |
| 文字保留 | ✓ 白字保留 | ✗ 文字一起变浅 | ✓ 白字保留 |
| 穿透 stacking context | ❌ 被锁住 | ✓ 像素穿透 | ✓ 像素穿透 |
| 抗锯齿保留 | ✓ | ✓ | ✓ |
| 实现复杂度 | 一行 CSS | 一行 CSS | 一行 CSS（含内联 SVG）|
| 推荐场景 | 简单情况 / 没有 stacking 障碍 | 不在乎文字清晰度 | ★ 复杂 stacking 时唯一可靠 |

### 核心经验

> **`mix-blend-mode` 不能穿透 stacking context；`opacity` 能；SVG 滤镜改 alpha 也能。**

凡是要"穿透多层合成层做透明"的场景，优先考虑直接改像素 alpha（SVG `feColorMatrix` 或 canvas 自身 opacity），而不是 blend mode。

### 通用 chroma-key 矩阵（可复用）

| 想做什么 | feColorMatrix `values` |
|---|---|
| 黑色 → 透明（亮度作 alpha）| `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  1 1 1 0 0` |
| 白色 → 透明（暗度作 alpha）| `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1 -1 -1 0 1` |
| 仅红色 → 透明 | `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1 1 1 0 -1`（需要调整公式）|

更复杂的 chroma-key 用 `feComponentTransfer` + 自定义曲线。

## 调试方法论

### Step 1：找真实的 DOM 类名

打开 PDF → `Ctrl+Shift+I` → Console 执行：

```javascript
const tl = document.querySelector('.textLayer');
let el = tl;
let depth = 0;
while (el && depth < 15) {
  const cs = getComputedStyle(el);
  console.log(`[${depth}]`,
    el.tagName.toLowerCase() +
    (el.id ? '#'+el.id : '') +
    (el.className ? '.'+el.className.split(/\s+/).join('.') : ''),
    '\n    bg:', cs.backgroundColor,
    '\n    --pdf-page-background:', cs.getPropertyValue('--pdf-page-background').trim() || '(none)',
    '\n    filter:', cs.filter,
    '\n    mix-blend-mode:', cs.mixBlendMode
  );
  el = el.parentElement;
  depth++;
}

// 同层兄弟
const parent = tl.parentElement;
[...parent.children].forEach(c => console.log(c.tagName, c.className));

// body 的所有类（揪出 minimal 的开关）
console.log(document.body.className);
```

**重点看**：
- 实际类名链路（不要相信文档）
- 哪一层有非透明背景
- `--pdf-page-background` 的实际计算值
- 哪一层有 `filter` / `mix-blend-mode`
- body 上有没有 `pdf-invert-dark` / `pdf-blend-light` 等 Minimal 开关类

### Step 2：源码定位

如果 DevTools 看不出来，到 Obsidian 安装目录的 `obsidian.asar` 里 grep：

```bash
ASAR=/c/Users/user/AppData/Local/Programs/Obsidian/resources/obsidian.asar

# 找类名
cat "$ASAR" | tr '\0' '\n' | \
  grep -oE '(#|\.)(pdf|PDF|viewer)[A-Za-z_-]*' | sort -u

# 找 CSS 变量定义
cat "$ASAR" | tr '\0' '\n' | \
  grep -oE '[^{}]{0,200}--pdf-[a-z-]+[^{}]{0,200}'

# 找特定函数实现
cat "$ASAR" | tr '\0' '\n' | \
  grep -oE 'setBackground[^}]{0,500}'
```

主题文件的 grep（theme.css 是单行压缩）：

```bash
# 用 awk 按 } 拆分单行 CSS
awk -v RS='}' '/pdf/' "/.../themes/Minimal/theme.css"
```

## 关键经验沉淀

### 1. 类名优先级排查顺序

1. DevTools 实地 DOM（最可靠）
2. 主题 `theme.css`
3. `obsidian.asar`（内核）

源码 grep 出的字符串可能是某个分支才用的类名，不能直接信。

### 2. 多重覆盖问题

定制 PDF 可能涉及 **三层叠加**：
- Obsidian 内核（CSS 变量 + canvas fillRect）
- 主题（如 Minimal 的 `pdf-invert-dark` filter 反转）
- 用户 snippet

调试时要一层一层定位「黑色到底来自哪里」。

### 3. `mix-blend-mode: screen` 的正确理解

公式：`screen(canvas, bg) = 1 - (1 - canvas) × (1 - bg)`

**关键性质**：**黑色 (0) 是 screen 的恒等元** —— `screen(0, X) = X`

| canvas 像素 | bg 像素（任意） | 结果 |
|---|---|---|
| 黑 (0) | 任意 X | X（直接显示 bg）✓ |
| 白 (255) | 任意 | 白 (255)（保留）✓ |

意味着：只要 canvas 反转成黑底白字，screen 后黑色像素**直接 = 下层颜色**。
所以 `.page` 不需要"足够亮"，**任何透明度的颜色都能让下层显示出来**。

### 4. 性能取舍：避免 `backdrop-filter`

`backdrop-filter: blur()` 实现磨砂玻璃视觉，但代价高：
- 每次滚动 / 缩放 / 重排都会**重新计算模糊**
- PDF 大文件 + 多页时掉帧明显

替代方案：
- 利用 `mix-blend-mode: screen` 的黑色恒等元性质（本笔记方案）
- 用 GPU 加速的 `box-shadow` / `border` 做卡片化
- 工作区底层渐变本身已经被 `body::before` 的 `filter: blur(48px)` 模糊过一次了，不需要再叠

### 5. CSS 变量改动的生效时机

`--pdf-page-background` 的值是 **PDF 加载时一次性读取**，存到 `pageBackground` 属性里。
**改 CSS 后必须 `Ctrl+R` 重启 Obsidian 重新加载 PDF**，单纯刷新片段没用。

### 6. canvas 圆角对齐：用父容器 `overflow: hidden`

`.page` 加 `border-radius: 6px` 后，里面的 canvas 默认还是直角，因为 **CSS 的 `border-radius` 只裁剪元素的边框 / 背景，不会裁剪 canvas 内部的绘制像素**。

#### ❌ 错误做法

```css
canvas {
  border-radius: 6px;   /* 几乎没用，浏览器对 canvas 内容不裁剪 */
}
```

#### ✅ 正确做法：父容器 `overflow: hidden`

```css
.pdfViewer .page {
  border-radius: 6px;
  overflow:      hidden;   /* ★ 关键：让圆角变成裁剪框 */
}
```

#### 工作原理

```
.page (border-radius: 6px, overflow: hidden)
  └── .canvasWrapper
        └── canvas（长方形 PDF 像素）

overflow: hidden 让 .page 充当圆角剪刀，
canvas 凡是超出 .page 圆角范围的部分都被剪掉。
```

#### 副作用检查表

| 影响项 | 是否需要担心 |
|---|---|
| canvas 圆角裁切 | ✓ 我们想要的 |
| 文字选择 / 拷贝 | 不影响 |
| `mix-blend-mode` 混合 | 不影响（`overflow:hidden` 只影响视觉裁剪，不动合成层级）|
| `box-shadow` 外阴影 | 仍正常显示（外阴影绘制在元素外部）|
| 创建新 stacking context | 不会（`overflow:hidden` 单独不创建）|

#### 通用规律

> **canvas / 视频 / 嵌入 iframe 等"内容元素"想要圆角，永远在父容器上设 `overflow: hidden`。**
>
> 不要试图给这些元素自己加 `border-radius`，浏览器的实现不一致，效果不可控。

## 升级：真正的"磨砂玻璃"质感（backdrop-filter）

> 📅 2026-04-29 增补：原方案让 PDF "看起来透明"，但只是色彩上的混合。
> 现在升级为**真正的高斯模糊磨砂玻璃**，让蝴蝶（[[Obsidian 红蝶背景 CSS 参数调整笔记]]）飘过 PDF 时被柔化。

### 核心：`backdrop-filter`

CSS `backdrop-filter` 模糊**元素后面**的合成内容（区别于 `filter` 处理**元素自身**）：

| 属性 | 作用 |
|------|------|
| `filter` | 处理元素的像素（含子元素）|
| **`backdrop-filter`** | 处理元素**后面**的像素，再叠加元素自身 |

这正是 Apple "Frosted Glass" 与各类毛玻璃 UI 的标准实现技术。

### 应用到 `.canvasWrapper`

```css
html body .canvasWrapper {
  filter: url('...chroma-key...') !important;
  backdrop-filter: blur(12px) saturate(1.15) brightness(1.05) !important;
  -webkit-backdrop-filter: blur(12px) saturate(1.15) brightness(1.05) !important;
  background-color: rgba(140, 160, 200, 0.08) !important;  /* 触发开关 + 玻璃色 */
  mix-blend-mode: normal !important;
  opacity: 1 !important;
}
```

### ⚠️ 关键 Hack：`background-color` 必须有非零 alpha

```css
background-color: rgba(140, 160, 200, 0.08);
                                       ^^^^
                                  必须 > 0
```

Chromium 89+ 要求元素必须有非完全透明的背景才会触发 `backdrop-filter` 的渲染管线。即使 alpha 只有 `0.001` 也行，但 `0` 不行。

这里用 `0.08` 同时实现两个目的：触发渲染 + 提供玻璃色调。

### chroma-key alpha offset：让黑色也透出磨砂

#### 问题

原始 chroma-key 矩阵：

```
1 0 0 0 0
0 1 0 0 0
0 0 1 0 0
1 1 1 0 0    → A' = R + G + B
```

黑色像素 (0,0,0) → A' = 0 → **完全透明**。

但 PDF 中那些"暗部"区域（黑色文字附近、阴影等）经过 chroma-key 后变得完全透明，**透出去的就只是空气**——`backdrop-filter` 模糊的内容看不到了。

#### 解决：在矩阵最后一列加 alpha offset

```
1 0 0 0 0
0 1 0 0 0
0 0 1 0 0
1 1 1 0 0.12    → A' = R + G + B + 0.12
                            ^^^^
                       保底 12% 不透明度
```

| 像素颜色 | 旧公式 | 新公式（offset 0.12） |
|---------|------|---------------------|
| 纯黑 (0,0,0) | A' = 0 → 完全透明 | A' = 0.12 → **12% 可见** ✨ |
| 暗灰 (0.2,0.2,0.2) | A' = 0.6 | A' = 0.72 |
| 中灰 (0.5,0.5,0.5) | A' = 1.5 → clamp 1 | A' = 1.62 → clamp 1（不变）|
| 纯白 (1,1,1) | A' = 3 → clamp 1 | A' = 3.12 → clamp 1（不变）|

效果：所有像素都至少 12% 不透明 → 整张 PDF 都浮在磨砂玻璃上，蝴蝶等背景内容透过玻璃模糊可见。

### 调节"磨砂强度"的关键旋钮

```
SVG 矩阵最后一行的最后一个数：
  0    = 旧效果（黑色完全透明）
  0.10 = 温和（建议起点）
  0.12 = 当前值
  0.20 = 玻璃感明显
  0.30 = 浓雾感
```

### 与红蝶背景的协同（z-index 层级）

PDF 区域的层级架构：

```
↑ 最上层
│  PDF 文字（白色，clamp 1 → 完全不透明）
│  .canvasWrapper { backdrop-filter: blur 12px } ← 模糊后面的内容
│  ↓
│  body::after { z-index: -1 } ← 🦋 蝴蝶（在 PDF 后面）
│  body::before { z-index: -2 } ← flowing-bg
│  body 实色底
↓ 最底层
```

蝴蝶飘过 PDF 区域时被 `backdrop-filter` 模糊化 → **磨砂玻璃下的红色幻影**，非常贴合 Fatal Frame II 主题。

详见 [[Obsidian 红蝶背景 CSS 参数调整笔记#十、层级架构（z-index 设计）]]。

---

## 相关文件

- [[.obsidian/snippets/pdf-frosted.css]] - 最终生效的 CSS 片段
- [[.obsidian/snippets/flowing-bg.css]] - 工作区流动渐变（提供磨砂玻璃的「光源」）
- [[.obsidian/snippets/red-butterfly.css]] - 红蝶背景（z-index 协同）
- [[.obsidian/appearance.json]] - 启用片段的配置
- [[.obsidian/plugins/obsidian-minimal-settings/data.json]] - Minimal 配色方案

## 相关链接

- Lucide 图标：<https://lucide.dev/icons/>
- Minimal 主题文档：<https://minimal.guide>
- MDN `mix-blend-mode`：<https://developer.mozilla.org/zh-CN/docs/Web/CSS/mix-blend-mode>
- MDN `backdrop-filter`：<https://developer.mozilla.org/zh-CN/docs/Web/CSS/backdrop-filter>
- MDN `feColorMatrix`：<https://developer.mozilla.org/zh-CN/docs/Web/SVG/Element/feColorMatrix>
