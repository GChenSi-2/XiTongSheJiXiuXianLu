---
tags:
  - obsidian
  - css
  - 主题定制
  - 动画
created: 2026-04-29
---

# Obsidian 红蝶背景 CSS 参数调整笔记

> 灵感来源：零·红蝶（Fatal Frame II / Project Zero II: Crimson Butterfly）
> 文件位置：`.obsidian/snippets/red-butterfly.css`

## 概述

在 Obsidian 工作区背景中渲染一只**侧面视角的暗红色蝴蝶**，缓缓漂浮、持续扇动翅膀。本笔记记录该 CSS Snippet 的关键参数调整方法，方便后续微调视觉风格。

---

## 一、核心技术原理

### 1.1 SMIL 动画在 `background-image` 中会被冻结

Chromium（Obsidian 底层 Electron）出于性能与安全考虑，将 `background-image: url(svg)` 中的 SVG **当作静态光栅图**渲染。SVG 内部的 `<animateTransform>` 等 SMIL 动画**不会播放**。

### 1.2 解决方法：用 `content: url()` 替代 `background-image`

| 方式 | 渲染机制 | SMIL 动画 |
| --- | --- | --- |
| `background-image: url(svg)` | 静态背景光栅化 | ❌ 冻结 |
| `content: url(svg)` | **替换元素**（同 `<img>`） | ✅ 正常播放 |

```css
body::after {
  content: url('data:image/svg+xml;utf8,...');  /* ✅ 关键：用 content */
  /* ❌ 不要用 background-image */
}
```

**原理**：当 `::after` 的 `content` 是 `url()` 时，浏览器把它视为「替换元素 (Replaced Element)」，行为等同于 `<img>` 标签——所有 `<img>` 中应有的特性（含 SMIL）都会启用。

---

## 二、双层叠加架构

> 🔕 **当前状态：SMIL 幻影层已禁用**（保留代码备份和说明，便于将来恢复）

```
SVG 内部结构（设计意图）：
├─ 第一层：静态基底蝴蝶（始终完整可见）  ← ✅ 当前唯一保留
└─ 第二层：opacity 0.55 的扇翅幻影         ← ⚠️ 已注释/移除
   └─ <animateTransform type="matrix"> 驱动 scaleY 压缩
      → 营造翅膀向中心合闭的视觉效果
```

**禁用原因**：实际渲染中扇翅幻影效果不明显，且增加了 ~30KB 数据 URL 体积。

**恢复方法**：在 SVG 中第一层 `<g>` 之后追加：

```xml
<g opacity="0.55">
  <animateTransform 
    attributeName="transform"
    type="matrix"
    values="1 0 0 1 0 0;
            1 0 0 1 0 0;
            1 0 0 0.45 0 137.5;
            1 0 0 1 0 0;
            1 0 0 0.40 0 150;
            1 0 0 1 0 0;
            1 0 0 1 0 0"
    keyTimes="0; 0.10; 0.25; 0.45; 0.60; 0.80; 1"
    dur="1.4s"
    repeatCount="indefinite"/>
  <g transform="skewY(20) scaleX(0.70) translate(30,20)">
    <path d="..." fill="url(#butterfly-red)" stroke="none"/>
  </g>
</g>
```

---

## 三、可调参数对照表

### 3.1 全局视觉参数（`body::after` 块）

| 参数 | 当前值 | 含义 | 调小效果 | 调大效果 |
| --- | --- | --- | --- | --- |
| `opacity` | `0.75` | 整体不透明度 | 更隐约 | 更清晰 |
| `width / height` | `220px / 180px` | 尺寸 | 蝴蝶更小 | 蝴蝶更大 |
| `margin` | `-90px 0 0 -110px` | 居中偏移（应为 `-height/2 / -width/2`） | — | — |
| `z-index` | `-1` | 层级（在内容下、flowing-bg 上） | 见第十节 | 见第十节 |

### 3.2 `filter` 滤镜组

| 滤镜 | 当前值 | 作用 | 调整建议 |
| --- | --- | --- | --- |
| `drop-shadow(0 0 26px rgba(150,20,40,0.55))` | 大光晕 | 红色辐射感 | 放大半径=幻光更柔；提高 alpha=红光更浓 |
| `drop-shadow(0 0 12px rgba(180,60,90,0.40))` | 小光晕 | 内层光晕 | 类似上面 |
| `brightness(0.78)` | 整体亮度 | <1 变暗，>1 变亮 | **0.6~0.9** 偏暗融合，**1.0~1.3** 鲜亮 |
| `contrast(1.05)` | 对比度 | <1 平淡，>1 锐利 | 0.8~1.0 柔和，1.1~1.5 醒目 |
| `saturate(0.85)` | 饱和度 | <1 灰暗，>1 鲜艳 | 0.6~0.9 暗调，1.1~1.5 鲜红 |

### 3.3 动画参数

| 参数 | 当前值 | 位置 | 含义 |
| --- | --- | --- | --- |
| 漂浮周期 | `380s`（~6.3 分钟） | `body::after` | 单一 transform 动画的总周期 |
| 时间函数 | `linear` | `body::after` | 多关键帧已平滑，避免缓动叠加抖动 |
| 初始 `animation-delay` | `-127s` | `body::after` | 让初始位置不在原点 |
| 关键帧数 | 24 帧 + 1 闭环 | `@keyframes butterfly-float` | 越多越细腻，但无需过多 |
| ~~SMIL `dur`~~ | ~~`1.4s`~~ | ~~SVG 内 `<animateTransform>`~~ | 已禁用（见第二节） |
| ~~扇翅 `values` 矩阵~~ | ~~`1 0 0 0.45 0 137.5` 等~~ | ~~SVG 内 `<animateTransform>`~~ | 已禁用 |
| ~~第二层 `opacity`~~ | ~~`0.55`~~ | ~~SVG 内幻影 `<g opacity>`~~ | 已禁用 |

---

## 四、典型调整场景

### 4.1 场景 A：蝴蝶太显眼，要更隐约

```css
opacity: 0.50;                  /* 0.75 → 0.50 */
filter:
  drop-shadow(0 0 20px rgba(120,15,35,0.40))
  drop-shadow(0 0 10px rgba(150,50,80,0.30))
  brightness(0.65)              /* 0.78 → 0.65 更暗 */
  contrast(0.95)
  saturate(0.70);               /* 红色更灰 */
```

### 4.2 场景 B：蝴蝶太暗，看不清楚

```css
opacity: 0.85;
filter:
  drop-shadow(0 0 30px rgba(220,30,60,0.70))
  drop-shadow(0 0 14px rgba(255,100,130,0.55))
  brightness(1.05)              /* 提亮 */
  contrast(1.15)
  saturate(1.10);               /* 鲜艳 */
```

### 4.3 场景 C：扇翅太快，影响阅读

修改 SVG 内 `<animateTransform>` 的 `dur` 属性（在 `red-butterfly.css` 文件中搜索 `dur%3D` 即 `dur=` 的 URL 编码形式）：

```
dur="1.4s"  →  dur="2.4s"   (扇翅变慢)
dur="1.4s"  →  dur="0.8s"   (扇翅变快)
```

> ⚠️ 修改 SVG 内的属性需要重新生成 data URL 编码。建议用 Python 脚本批量重生成。

### 4.4 场景 D：漂浮太慢/太快

直接调整单一 animation 周期：

```css
animation: butterfly-float 200s linear infinite -127s;  /* 380 → 200 更快 */
animation: butterfly-float 600s linear infinite -127s;  /* 380 → 600 更慢 */
```

---

## 五、漂浮路径：单 transform 动画 + 伪随机轨迹

### 5.0 ⚠️ 性能教训（重要）

> **失败的尝试**：曾用 `@property` + CSS variables 实现三轴独立动画（401/487/503s 质数周期）。
> **结果**：动画卡顿明显。
> **原因**：CSS variables 的动画**只能在主线程 (CPU) 上每帧重新计算**，无法被 GPU compositor 加速。

| 动画方式 | 渲染层 | 流畅度 |
| --- | --- | --- |
| `transform: translate(...) rotate(...)` 直接动画化 | GPU compositor | 🟢 极流畅 |
| `transform: translate(var(--bx), ...)` 通过变量 | CPU 主线程 | 🔴 卡顿 |

**结论**：必须让 `transform` **直接被动画化**才能享受 GPU 加速。

### 5.1 当前设计：单一 keyframes + 多帧伪随机

| 技巧 | 实现 | 效果 |
| --- | --- | --- |
| **单 transform 动画** | 一个 `@keyframes butterfly-float` 控制 transform | GPU compositor 加速，丝滑 |
| **24 个不规则关键帧** | 用 Python 生成正弦叠加位置 | 视觉上像伪随机轨迹 |
| **整数倍频正弦** | freq 主频 1 + 副频 3/4/2（都整数） | t=0 与 t=1 自然相等，循环无跳变 |
| **负 `animation-delay`** | `-127s` | 让每次加载初始位置不在原点 |
| **`linear` 时间函数** | 替代 ease-in-out | 多关键帧已自然平滑，避免叠加缓动产生抖动 |

### 5.2 应用到 `body::after`

```css
animation: butterfly-float 380s linear infinite -127s;
```

### 5.3 关键帧生成（Python 脚本）

```python
import math

def gen_position(t):
    """t in [0, 1)。整数倍频确保 t=0 = t=1，循环无跳变。
    三层叠加增加不规则性，振幅放大到覆盖整个屏幕。"""
    # X：主频 1 + 副频 3 + 5，振幅 30/10/4
    x = 30 * math.sin(2 * math.pi * t * 1 + 0.5) \
      + 10 * math.sin(2 * math.pi * t * 3 + 2.1) \
      + 4 * math.sin(2 * math.pi * t * 5 + 1.3)
    # Y：主频 1 + 副频 2 + 4，振幅 26/8/3
    y = 26 * math.sin(2 * math.pi * t * 1 + 2.7) \
      + 8 * math.sin(2 * math.pi * t * 2 + 0.9) \
      + 3 * math.sin(2 * math.pi * t * 4 + 1.8)
    # 旋转：主频 1 + 副频 2
    r = 11 * math.sin(2 * math.pi * t * 1 + 1.8) \
      + 4 * math.sin(2 * math.pi * t * 2 + 0.4)
    return x, y, r

n_frames = 28  # 增多关键帧让大振幅时插值更平滑
for i in range(n_frames + 1):
    t = i / n_frames
    pct = i * 100 / n_frames
    x, y, r = gen_position(t)
    print(f"  {pct:.2f}% {{ transform: translate({x:.1f}vw, {y:.1f}vh) rotate({r:.1f}deg); }}")
```

**当前轨迹覆盖范围**：

| 轴 | 范围 | 占视口比例 |
| --- | --- | --- |
| X | `-32.7vw` → `+32.7vw` | ~65% 宽度 |
| Y | `-35.4vh` → `+21.9vh` | ~57% 高度 |
| 旋转 | `-13.2°` → `+12.9°` | — |

> 💡 振幅再增大可能让蝴蝶飞出屏幕（蝴蝶宽度 220px ≈ 11vw，需留余量）。

### 5.4 调整建议

| 想要的效果 | 调整方法 |
| --- | --- |
| 飘动更快 | 把 `380s` 改小，如 `200s` |
| 飘动更慢 | 把 `380s` 改大，如 `600s` |
| 路径更宽广 | 调大 `gen_position` 中的振幅（X: 26→40, Y: 20→32） |
| 路径更收敛 | 调小振幅（X: 26→15, Y: 20→12） |
| 旋转更夸张 | `r` 振幅 10→20 |
| 旋转更稳重 | `r` 振幅 10→5 |
| 轨迹更复杂 | 副频改大或新增第三个频率项 |
| 初始位置变化 | 修改 `-127s` 的负 delay 到任意值 |

### 5.5 关键约束

- **副频必须是主频的整数倍**（如 1+3, 1+4, 1+2）
  - 否则 t=0 与 t=1 不相等，循环时会跳变
  - 验证：`gen_position(0)` 应等于 `gen_position(1)`
- **不要用 `var()` 嵌入 transform**
  - 否则失去 GPU 加速，动画会卡
- **`linear` 而非 `ease-in-out`**
  - 24 关键帧已经平滑，叠加缓动反而抖动
- **`will-change: transform;` 必须保留**
  - 提示浏览器开启 GPU 合成层

---

## 六、性能优化与无障碍

### 6.1 `prefers-reduced-motion` 支持

```css
@media (prefers-reduced-motion: reduce) {
  body::after {
    animation: none;
    transform: translate(0, 0);
    opacity: 0.45;
  }
}
```

操作系统启用「减少动画」选项时，蝴蝶停止漂浮，只显示静态淡影，避免对眩晕敏感用户造成不适。

### 6.2 `will-change` 提示

```css
will-change: transform;
```

提前告知浏览器 `transform` 会变化，启用 GPU 加速。

---

## 七、调试 Checklist

蝴蝶看不见时按顺序排查：

1. **`appearance.json` 是否启用了 snippet**
   ```json
   "enabledCssSnippets": ["flowing-bg", "pdf-frosted", "red-butterfly"]
   ```
2. **`z-index` 是否正确**（详见第十节）
   - 蝴蝶应为 `-1`，flowing-bg 应为 `-2`
   - 临时设为 `100` 测试是否能"强行可见"
3. **`opacity` 是否过低** → 临时设为 `1.0` 测试
4. **`content: url(...)` 是否正确** → 不要写成 `background-image`
5. **SVG data URL 是否完整** → 检查末尾是否有 `</svg>` 闭合
6. **DevTools 打开** → `Ctrl+Shift+I` 查看 `body::after` 是否被解析

---

## 八、相关文件

- 主样式文件：`.obsidian/snippets/red-butterfly.css`
- 启用配置：`.obsidian/appearance.json`
- 协调依赖：`.obsidian/snippets/flowing-bg.css`（z-index 必须 < 蝴蝶，详见第十节）
- 协调依赖：`.obsidian/snippets/pdf-frosted.css`（PDF 磨砂玻璃模糊蝴蝶，详见第十节）
- 配套笔记：[[Obsidian PDF 磨砂背景定制笔记]]
- 设计参考：`twobutterflies.svg`（vault 根目录，蝴蝶2 路径数据来源）

---

## 九、附录：完整参数当前值快照（2026-04-29）

```css
body::after {
  content: url('data:image/svg+xml;utf8,...');
  position: fixed;
  top: 50%;
  left: 50%;
  width: 220px;
  height: 180px;
  margin: -90px 0 0 -110px;
  pointer-events: none;
  z-index: -1;          /* ★ 在内容下、flowing-bg(z=-2) 上 */
  opacity: 0.75;
  filter:
    drop-shadow(0 0 26px rgba(150, 20, 40, 0.55))
    drop-shadow(0 0 12px rgba(180, 60, 90, 0.40))
    brightness(0.78)
    contrast(1.05)
    saturate(0.85);
  animation: butterfly-float 380s linear infinite -127s;
  will-change: transform;
}

/* 24 个关键帧由整数倍频正弦叠加生成（详见第五节） */
@keyframes butterfly-float {
  0% { transform: translate(16.6vw, 21.7vh) rotate(8.5deg); }
  /* ... 共 25 行（含 100% 闭环） ... */
  100% { transform: translate(16.6vw, 21.7vh) rotate(8.5deg); }
}
```

---

## 十、层级架构（z-index 设计）

### 10.1 设计目标

让蝴蝶**漂浮在背景渐变之上**、**所有内容之下**：

- ✅ 工作区文字 / PDF / UI 元素**始终清晰**显示在蝴蝶之上
- ✅ 蝴蝶飘到 PDF 区域时被 `backdrop-filter` 磨砂玻璃**虚化**（零·红蝶幻影氛围 ✨）
- ✅ 蝴蝶在编辑区半透明底色（`rgba(0,0,0,0.12)`）下**朦胧透出**
- ❌ 不能盖住任何内容（之前的 `z-index: 10` 把蝴蝶顶到了最上层）

### 10.2 完整层级表

```
↑ 最上层（最近用户）
│
│  PDF / 工作区文字 / UI 元素            (z-index: auto / 0+)
│  └─ .canvasWrapper                    (backdrop-filter: blur 12px)
│     ↑ 经过这里时蝴蝶被磨砂玻璃模糊化
│
│  body::after  🦋 蝴蝶                  (z-index: -1)
│
│  body::before  🌊 flowing-bg 渐变       (z-index: -2)
│
│  body 实色底  background-color: #252a35 (root stacking context 背景)
│
↓ 最底层
```

### 10.3 实现细节

#### 蝴蝶（`.obsidian/snippets/red-butterfly.css`）

```css
body::after {
  /* ... */
  z-index: -1;       /* 内容之下、flowing-bg 之上 */
}
```

#### flowing-bg（`.obsidian/snippets/flowing-bg.css`）

```css
body::before {
  /* ... */
  z-index: -2;       /* 最底层 */
}
```

> ⚠️ **必须同步修改两个文件**。如果只改蝴蝶为 `-1` 而 flowing-bg 仍为 `0`，蝴蝶会被渐变挡住（虽然渐变有透明部分但视觉效果差）。

### 10.4 CSS Stacking Context 原理

为什么 `z-index: -1` 的蝴蝶不会被 `body` 的实色背景遮挡？

| 概念 | 说明 |
| --- | --- |
| **Root stacking context** | `<html>` 元素是默认的 stacking context root |
| **body 背景上提** | 浏览器把 `body` 的 `background-color` 提升到 `<html>`，渲染在 root 的最底层 |
| **负 z-index 元素** | `z-index: -1` 的元素在 root context 中位于"内容下方"但仍**高于背景** |
| **伪元素 stacking** | `body::before` 和 `body::after` 在父元素 stacking context 中按 z-index 排列 |

所以分层顺序：

```
1. <html> 根背景
2. body 背景色 (#252a35) ← 上提到 root 最底
3. body::before (z=-2) ← flowing-bg
4. body::after (z=-1) ← 蝴蝶
5. .app-container 等 normal flow 元素 (z=auto)
6. positioned + z-index ≥ 0 元素
```

### 10.5 与 PDF 磨砂玻璃的协同

蝴蝶飘过 PDF 时的视觉效果链路：

```
1. 工作区背景渲染（flowing-bg z=-2 + body 实色）
2. 蝴蝶渲染（z=-1）
3. PDF .canvasWrapper 渲染：
   ├─ backdrop-filter: blur(12px) 处理"它后面"的合成内容
   │  → 模糊掉了蝴蝶 + flowing-bg
   ├─ 自身 background rgba(140,160,200,0.08) 玻璃色调
   └─ SVG chroma-key 让纯黑像素也保留 12% alpha（见 PDF 笔记）
4. PDF 文字（白色）清晰渲染在最上层
```

最终视觉：**清晰的 PDF 文字** 浮在 **磨砂玻璃** 上，玻璃下能隐约看到**模糊的红蝶幻影**飘过——非常贴合 Fatal Frame II 的氛围。

### 10.6 调整建议

| 想要的效果 | 调整方法 |
| --- | --- |
| 蝴蝶完全隐藏（仅作背景纹理） | `z-index: -3`（移到 flowing-bg 之下） |
| 蝴蝶可见性最强（盖在内容上） | `z-index: 100`（不推荐，挡住文字） |
| 让侧边栏遮挡蝴蝶更彻底 | 调高侧边栏的 `background-color` alpha（`flowing-bg.css` 第 66 行） |
| 让磨砂玻璃下蝴蝶更明显 | 提高 `pdf-frosted.css` 中 chroma-key 的 alpha offset（`0.12` → `0.20`） |

### 10.7 常见误区

- ❌ **以为 `z-index: -1` 就会被 body 背景挡住** —— 不会，body 背景在 root 最底，负 z-index 的元素仍然在它之上。
- ❌ **以为单改蝴蝶 z-index 就够了** —— 必须同时把 flowing-bg 调到更低的负值，否则渐变会盖住蝴蝶。
- ❌ **以为 `pointer-events: none` 影响层级** —— 它只影响鼠标事件，不影响视觉 stacking。
