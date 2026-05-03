---
tags:
  - web-api
  - javascript
  - dom
  - 前端
created: 2026-04-24
---

# getBoundingClientRect

## 概述

`Element.getBoundingClientRect()` 是浏览器原生提供的 DOM API，用于获取某个元素**相对于当前视口（viewport）**的位置和尺寸信息。它返回一个 `DOMRect` 对象，包含该元素的完整几何数据。

```js
const rect = element.getBoundingClientRect();
```

---

## 返回值：DOMRect 对象

| 属性           | 含义                               |
| ------------ | -------------------------------- |
| `x` / `left` | 元素左边缘距视口左侧的距离（px）                |
| `y` / `top`  | 元素上边缘距视口顶部的距离（px）                |
| `right`      | 元素右边缘距视口左侧的距离（等于 `left + width`） |
| `bottom`     | 元素下边缘距视口顶部的距离（等于 `top + height`） |
| `width`      | 元素的渲染宽度（含 `padding` + `border`）  |
| `height`     | 元素的渲染高度（含 `padding` + `border`）  |

> [!tip] 坐标系原点
> 所有坐标以**视口左上角**为原点，向右 / 向下为正方向。
> 如果页面已滚动，`top` / `left` 可能为负值（元素在视口上方 / 左方已被滚出屏幕）。

### 可视化示意

```
viewport (0, 0)
┌──────────────────────────────────────┐
│                 ↑ top                │
│          ┌──────┴──────┐             │
│  left →  │   element   │ ← right     │
│          └──────┬──────┘             │
│                 ↓ bottom             │
└──────────────────────────────────────┘
```

---

## 与页面绝对坐标的换算

`getBoundingClientRect` 返回的是**视口相对坐标**，若需要换算为页面绝对坐标（相对于文档左上角），需加上滚动偏移：

```js
const rect = element.getBoundingClientRect();

const absoluteTop  = rect.top  + window.scrollY;
const absoluteLeft = rect.left + window.scrollX;
```

---

## 常见使用场景

### 1. 判断元素是否在视口内（懒加载 / 曝光统计）

```js
function isInViewport(el) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top  >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right  <= window.innerWidth
  );
}

window.addEventListener('scroll', () => {
  if (isInViewport(lazyImage)) {
    lazyImage.src = lazyImage.dataset.src; // 触发图片加载
  }
});
```

> [!note] 更优方案
> 对于大量元素的懒加载，推荐使用 `IntersectionObserver` API，性能更好，不需要监听 `scroll` 事件。`getBoundingClientRect` 适合**一次性**或**低频**的位置查询。

---

### 2. Tooltip / Popover 动态定位

在鼠标悬停时，将提示框精确定位在目标元素旁边：

```js
button.addEventListener('mouseenter', () => {
  const rect = button.getBoundingClientRect();

  tooltip.style.top  = `${rect.bottom + window.scrollY + 8}px`; // 元素下方 8px
  tooltip.style.left = `${rect.left   + window.scrollX}px`;
  tooltip.style.display = 'block';
});
```

---

### 3. 拖拽（Drag & Drop）边界检测

判断被拖拽元素是否进入了某个放置区域：

```js
function isOverDropZone(dragRect, dropRect) {
  return !(
    dragRect.right  < dropRect.left  ||
    dragRect.left   > dropRect.right ||
    dragRect.bottom < dropRect.top   ||
    dragRect.top    > dropRect.bottom
  );
}

document.addEventListener('mousemove', (e) => {
  const dragRect = draggable.getBoundingClientRect();
  const dropRect = dropZone.getBoundingClientRect();

  if (isOverDropZone(dragRect, dropRect)) {
    dropZone.classList.add('active');
  }
});
```

---

### 4. 滚动到元素时触发动画

```js
const observer = () => {
  const rect = animatedEl.getBoundingClientRect();
  if (rect.top < window.innerHeight * 0.85) {
    animatedEl.classList.add('fade-in');
  }
};

window.addEventListener('scroll', observer, { passive: true });
```

---

### 5. Canvas / WebGL 叠层对齐

将 Canvas 或 WebGL 绘制的内容与 DOM 元素精确对齐（常见于数据可视化标注）：

```js
const targetRect = domElement.getBoundingClientRect();
const canvasRect  = canvas.getBoundingClientRect();

// 计算目标元素在 Canvas 坐标系中的位置
const x = targetRect.left - canvasRect.left;
const y = targetRect.top  - canvasRect.top;

ctx.strokeRect(x, y, targetRect.width, targetRect.height);
```

---

### 6. 虚拟列表 / 动态高度计算

在实现虚拟滚动时，测量每一行的真实渲染高度：

```js
listItems.forEach((item, index) => {
  const rect = item.getBoundingClientRect();
  rowHeights[index] = rect.height;
});
```

---

## 最佳实践

核心原则：**尽量少调用，调用就批量读完**。每次调用都会触发浏览器强制重新计算布局（reflow），代价不小。

### 1. 先批量读，再批量写

交替「写样式 → 读 rect」会在每次读之前触发一次 reflow：

```js
// ❌ 触发 3 次 reflow
box1.style.width = '100px';
const r1 = box1.getBoundingClientRect(); // reflow #1

box2.style.width = '200px';
const r2 = box2.getBoundingClientRect(); // reflow #2

box3.style.width = '300px';
const r3 = box3.getBoundingClientRect(); // reflow #3
```

```js
// ✅ 先把所有 rect 一次性读完，再统一写，只触发 1 次 reflow
const r1 = box1.getBoundingClientRect();
const r2 = box2.getBoundingClientRect();
const r3 = box3.getBoundingClientRect(); // 这 3 次读共享同一次 reflow

box1.style.width = `${r1.width * 2}px`;
box2.style.width = `${r2.width * 2}px`;
box3.style.width = `${r3.width * 2}px`;
```

### 2. 在 `scroll` 里调用要配合 `requestAnimationFrame` 节流

`scroll` 事件触发频率极高（每帧多次），直接在里面调用会持续触发 reflow：

```js
// ❌ 每次 scroll 都 reflow，掉帧
window.addEventListener('scroll', () => {
  const rect = el.getBoundingClientRect();
  if (rect.top < 100) doSomething();
});
```

```js
// ✅ 用 rAF 节流，每帧最多执行一次
let pending = false;

window.addEventListener('scroll', () => {
  if (pending) return;
  pending = true;

  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    if (rect.top < 100) doSomething();
    pending = false;
  });
}, { passive: true });
```

### 3. 持续监听可见性 → 换用 `IntersectionObserver`

如果目的是「监听元素进入 / 离开视口」，`IntersectionObserver` 由浏览器在合适时机异步回调，**完全不触发 reflow**：

```js
// ❌ 用 getBoundingClientRect 轮询可见性（高频 reflow）
window.addEventListener('scroll', () => {
  images.forEach(img => {
    const rect = img.getBoundingClientRect();
    if (rect.top < window.innerHeight) loadImage(img);
  });
});
```

```js
// ✅ IntersectionObserver：零 reflow，浏览器原生优化
const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      loadImage(entry.target);
      io.unobserve(entry.target); // 加载后停止观察
    }
  });
});

images.forEach(img => io.observe(img));
```

> 经验法则：需要「持续监听」用 `IntersectionObserver`；需要「一次性精确坐标」（比如定位 Tooltip）才用 `getBoundingClientRect`。

### 4. 缓存结果，同一逻辑块内不要重复调用

```js
// ❌ 同一个函数里调用了 3 次，触发 3 次 reflow
function positionTooltip(btn, tip) {
  tip.style.top   = btn.getBoundingClientRect().bottom + 'px';
  tip.style.left  = btn.getBoundingClientRect().left   + 'px';
  tip.style.width = btn.getBoundingClientRect().width  + 'px';
}
```

```js
// ✅ 调用一次，结果复用
function positionTooltip(btn, tip) {
  const rect = btn.getBoundingClientRect(); // 只 reflow 一次
  tip.style.top   = `${rect.bottom}px`;
  tip.style.left  = `${rect.left}px`;
  tip.style.width = `${rect.width}px`;
}
```

### 小结

| 原则 | 记忆口诀 |
|------|---------|
| 先读后写 | 读完再动 DOM |
| 高频场景节流 | 配合 `rAF` |
| 持续监听换 API | 用 `IntersectionObserver` |
| 一次调用复用结果 | 存进变量再用 |

---

## 注意事项

> [!warning] 性能陷阱：强制同步布局（Forced Reflow）
> 每次调用 `getBoundingClientRect()` 都会强制浏览器**立即完成布局计算**（reflow），以确保返回最新值。
>
> 如果在同一帧内**先写 DOM 再读 rect**，会导致多次强制 reflow，严重影响性能：
>
> ```js
> // ❌ 坏：写 → 读 → 写 → 读，触发多次 reflow
> el1.style.width = '100px';
> const r1 = el1.getBoundingClientRect(); // reflow!
> el2.style.width = '200px';
> const r2 = el2.getBoundingClientRect(); // reflow!
>
> // ✅ 好：先批量读，再批量写
> const r1 = el1.getBoundingClientRect();
> const r2 = el2.getBoundingClientRect();
> el1.style.width = `${r1.width * 2}px`;
> el2.style.width = `${r2.width * 2}px`;
> ```

> [!warning] 隐藏元素返回全零
> `display: none` 的元素无法参与布局，`getBoundingClientRect()` 会返回全部为 `0` 的 `DOMRect`。
> 若需要测量隐藏元素，可临时设置 `visibility: hidden` + `position: absolute` 后再测量。

> [!info] iframe 跨域限制
> 在 `iframe` 中调用时，坐标是相对于 **iframe 自身视口**，而非父页面视口。跨域 iframe 无法直接获取父页面坐标。

---

## 与相关 API 的对比

| API | 坐标系 | 适用场景 |
|-----|--------|---------|
| `getBoundingClientRect()` | 视口相对 | 精确位置查询、一次性测量 |
| `IntersectionObserver` | 视口相对（比例） | 批量元素可见性监听，性能更优 |
| `offsetTop` / `offsetLeft` | 相对于 `offsetParent` | 简单布局计算，不含滚动 |
| `scrollTop` / `scrollLeft` | 元素内部滚动偏移 | 控制 / 读取滚动位置 |
| `clientX` / `clientY`（鼠标事件） | 视口相对 | 鼠标位置，与 rect 坐标系一致 |

---

## 快速参考

```js
const rect = el.getBoundingClientRect();

// 元素中心点（视口坐标）
const centerX = rect.left + rect.width  / 2;
const centerY = rect.top  + rect.height / 2;

// 元素是否部分可见
const isPartiallyVisible =
  rect.bottom > 0 &&
  rect.right  > 0 &&
  rect.top    < window.innerHeight &&
  rect.left   < window.innerWidth;

// 转换为页面绝对坐标
const absTop  = rect.top  + window.scrollY;
const absLeft = rect.left + window.scrollX;
```
