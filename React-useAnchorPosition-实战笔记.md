# 自定义 Hook 实战:useAnchorPosition 的设计与边界

> 浮层定位是 Tooltip / Popover / Dropdown 等组件的核心问题。本笔记从最简版本出发,逐步加上真实工程中要处理的边界情况,讲清每一行代码"为什么存在"。最后给出生产级完整版本,以及不重复造轮子的建议。

---

## 一、需求拆解:这个 Hook 要做什么

### 1.1 输入输出

```tsx
const coords = useAnchorPosition(anchorRef, floatRef, visible, offset);
```

**输入**:

- `anchorRef` —— 触发区元素(比如 `<QuestionIcon>` 的容器 span)
- `floatRef` —— 浮层元素(`PositionedLayer` 那个 div)
- `visible` —— 是否显示浮层
- `offset` —— 浮层和触发区之间的距离

**输出**:

- `{ left, top }` —— 浮层应该被放在视口的哪个像素位置(因为 `position: fixed`,坐标基于视口)

### 1.2 核心算法

1. 测量 anchor 在视口里的位置(用 `getBoundingClientRect`)
2. 测量 float 自身的尺寸
3. 算出"放在 anchor 上方居中"的坐标
4. 处理边界(超出屏幕怎么办)
5. 处理动态变化(滚动、resize、内容尺寸变化)

---

## 二、最简版本:理解骨架

```tsx
import { useState, useLayoutEffect, RefObject } from 'react';

export function useAnchorPosition(
  anchorRef: RefObject<HTMLElement | null>,
  floatRef: RefObject<HTMLElement | null>,
  visible: boolean,
  offset: number
) {
  const [coords, setCoords] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!visible) return;
    
    const anchor = anchorRef.current;
    const float = floatRef.current;
    if (!anchor || !float) return;

    const anchorRect = anchor.getBoundingClientRect();
    const floatRect = float.getBoundingClientRect();

    // 默认放在 anchor 上方,水平居中
    const left = anchorRect.left + anchorRect.width / 2 - floatRect.width / 2;
    const top = anchorRect.top - floatRect.height - offset;

    setCoords({ left, top });
  }, [visible, offset]);

  return coords;
}
```

这版本能跑,但有几个坑要逐个填。

### 2.1 为什么用 `useLayoutEffect` 而不是 `useEffect`?

**`useEffect`** 在浏览器**绘制完成之后**才执行:

1. React 渲染浮层(此时 `coords = {0, 0}`)
2. 浏览器画到屏幕上(浮层短暂出现在左上角)
3. effect 执行,算出真坐标
4. setState 触发重新渲染
5. 浏览器再画一次(浮层跳到正确位置)

用户会看到浮层"闪一下从左上角跳过去"。

**`useLayoutEffect`** 在浏览器绘制**之前**同步执行,坐标算好后立刻更新,用户只看到一次绘制,无闪烁。

> **经验法则**:测量 DOM + 立刻调整 → 用 `useLayoutEffect`;副作用、订阅、网络 → 用 `useEffect`。

### 2.2 为什么要等 `visible` 才测量?

浮层不显示时:

- 浮层 DOM 可能还不存在(`floatRef.current` 是 null)
- 或者它的尺寸是 0
- 算出来的坐标无意义

只有 `visible = true` 时,浮层才被 React 渲染出来,这时才能测量。

---

## 三、第一个坑:首次渲染的"左上角闪烁"

仔细看 Tooltip 的渲染部分:

```tsx
{visible &&
  createPortal(
    <PositionedLayer ref={floatRef} left={coords.left} top={coords.top}>
      ...
    </PositionedLayer>,
    document.body
  )}
```

第一次 hover 时,流程是:

1. `setVisible(true)` 触发重渲染
2. React 渲染 `<PositionedLayer left={0} top={0}>`(初始 coords)
3. `useLayoutEffect` 执行,测量并 setState
4. React 重渲染,坐标正确

中间的"第 2 步"会让浮层在视口左上角短暂出现一帧——即使是 `useLayoutEffect`,因为**第一次渲染时 `floatRef.current` 还没挂载**,要等到第二次才能测量。

### 解决方案:第一帧让浮层不可见

用 `null` 表示"还没算出来":

```tsx
const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
```

父组件渲染时:

```tsx
<PositionedLayer 
  ref={floatRef} 
  left={coords?.left ?? 0} 
  top={coords?.top ?? 0}
  style={{ visibility: coords ? 'visible' : 'hidden' }}
>
```

**关键点**:用 `visibility: hidden` 而不是 `display: none`——因为我们需要浮层真实存在于 DOM 里以便测量,只是视觉上不可见。等坐标算好后才显示。

---

## 四、第二个坑:超出屏幕边界

如果 anchor 在屏幕顶部,浮层放它上方会被截断到视口外。需要处理三种情况:

```tsx
const viewportWidth = window.innerWidth;
const viewportHeight = window.innerHeight;
const margin = 8;  // 距离屏幕边缘留白

let left = anchorRect.left + anchorRect.width / 2 - floatRect.width / 2;
let top = anchorRect.top - floatRect.height - offset;

// 1. 上方放不下 → 翻转到下方
if (top < margin) {
  top = anchorRect.bottom + offset;
}

// 2. 水平方向不要超出视口
left = Math.max(margin, Math.min(left, viewportWidth - floatRect.width - margin));

// 3. 下方也放不下(极端情况)→ 贴底
if (top + floatRect.height > viewportHeight - margin) {
  top = viewportHeight - floatRect.height - margin;
}
```

这就是社区库里说的两种基本策略:

- **flip(翻转)**:首选位置放不下,换到反方向(上↔下、左↔右)
- **shift(挤压)**:位置不变但偏移一下,使其塞进视口

生产级别的库 [Floating UI](https://floating-ui.com/) 把这些做成可组合的 middleware。

### 4.1 深入理解 clamp 操作

水平方向的这一行:

```ts
left = Math.max(margin, Math.min(left, vw - floatRect.width - margin));
```

它的作用一句话:**把 `left` 的值"夹"在合法区间 `[margin, vw - floatRect.width - margin]` 之内**。这就是编程里的 **clamp(夹紧)** 操作。

#### 从内到外读

JS 表达式从内层括号开始执行,所以拆开来看:

**第 1 步**:`Math.min(left, vw - floatRect.width - margin)`

- 含义:取 `left` 和"右边界允许的最大值"中的**较小者**
- 作用:**防止超出右边**——如果 `left` 太大,就把它压到不超过右边界
- 右边界允许的最大值 = 视口宽度 - 浮层宽度 - 边距,这是浮层左上角的最大允许位置(再往右浮层就会被切掉)

**第 2 步**:`Math.max(margin, ...)`

- 含义:取上一步结果和 `margin` 中的**较大者**
- 作用:**防止超出左边**——如果上一步结果太小(甚至是负数),就把它抬到至少等于 `margin`

#### 用具体数字感受一下

假设 `vw = 800`、`floatRect.width = 120`、`margin = 8`,合法区间是 `[8, 672]`:

| 原始 `left` | `Math.min(left, 672)` | `Math.max(8, ...)` | 最终 |
|---|---|---|---|
| 280(正常) | 280 | 280 | **280**(不变) |
| -30(超左) | -30 | 8 | **8**(夹到左边界) |
| 700(超右) | 672 | 672 | **672**(夹到右边界) |
| 5(略微超左) | 5 | 8 | **8** |

#### 通用 clamp 函数

如果嫌嵌套读起来累,可以抽出来:

```ts
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

// 使用:
left = clamp(left, margin, vw - floatRect.width - margin);
```

这种 clamp 模式在编程中无处不在:

- 进度条:百分比夹在 `[0, 100]`
- 滑块控件:值夹在 `[min, max]`
- 颜色值:RGB 通道夹在 `[0, 255]`
- 滚动位置:`scrollTop` 夹在 `[0, maxScroll]`
- 游戏角色坐标:夹在地图边界内

Lodash 有 `_.clamp`,Rust 标准库有 `f64::clamp`,Kotlin 有 `coerceIn`,JS 也已有提案要加 `Math.clamp`。

#### CSS 也有原生的 clamp()

```css
font-size: clamp(14px, 2vw, 18px);
/* 字号至少 14px,最大 18px,中间随视口宽度变化 */
```

逻辑和 `Math.max(min, Math.min(value, max))` 完全等价,只是写起来更清爽。前端做响应式布局时是必备工具。

---

## 五、为什么垂直方向用 flip,水平方向用 clamp?

注意到一个有意思的不对称:

```ts
// 垂直方向:flip + 兜底
let top = anchorRect.top - floatRect.height - offset;
if (top < margin) {                           // 上方放不下
  top = anchorRect.bottom + offset;           // → 翻到下方
}
if (top + floatRect.height > vh - margin) {   // 下方也放不下(极端)
  top = vh - floatRect.height - margin;       // → 贴底兜底
}

// 水平方向:直接 clamp
left = Math.max(margin, Math.min(left, vw - floatRect.width - margin));
```

**为什么不一视同仁,水平也用 flip?或者垂直也直接 clamp?**

### 5.1 关键差异:浮层会不会遮挡 anchor

想象 anchor 在屏幕**最顶端**,默认浮层放它上方,这时上方放不下:

#### 方案 A:直接 clamp(贴顶)

浮层会被强制压到屏幕顶部 `top = margin`,但此时它会**盖住 anchor 本身**——因为 anchor 也在屏幕顶部:

```
[浮层贴在屏幕顶部 ████]  ← 贴顶
[anchor 在这里 ▼]        ← 被浮层盖住!
```

用户的鼠标悬停在 anchor 上,但浮层把 anchor 挡住了——视觉上很糟糕,而且鼠标移动可能触发 hover 状态错乱(`onMouseLeave` 误触发,浮层闪烁消失)。

#### 方案 B:flip(翻到下方)

```
[anchor 在这里 ▼]        ← 触发区
   ↓
[浮层翻到下方 ████]      ← 完整显示,不遮挡
```

浮层完整显示,且不遮挡 anchor。用户体验明显更好。

### 5.2 为什么水平方向直接 clamp 就够了?

水平方向上,浮层默认**水平居中**于 anchor。如果 anchor 太靠左/右:

```
anchor 在屏幕最左边                          anchor 在屏幕最右边
                                              
[浮层贴左边 ████      ]                      [      ████ 浮层贴右边]
   ↑                                                       ↑
   ▼ anchor                                          anchor ▼
```

浮层依然在 anchor 的上方或下方,**水平上 anchor 和浮层不在一条直线上,不会互相遮挡**——这是和垂直方向最大的差别。

水平 flip 在这里也没意义——因为默认是"水平居中",不是"左对齐"或"右对齐",根本没有反方向可翻。

### 5.3 本质差异:几何关系决定策略

| 方向 | 浮层和 anchor 的几何关系 | 直接 clamp 会怎样 | 因此选用 |
|---|---|---|---|
| **垂直**(浮层在 anchor 上方/下方) | 上下排布,clamp 后**会上下重叠** | 浮层盖住 anchor | **flip 优先** |
| **水平**(浮层水平居中于 anchor) | 浮层**包住** anchor 中心,clamp 只是横向偏移 | 浮层依然在 anchor 上下侧,不重叠 | **clamp 即可** |

**根本原因**:

- 垂直方向上,浮层和 anchor **共用一条垂直轴**——它们的水平投影重合,垂直方向再压缩就会重叠
- 水平方向上,浮层和 anchor **不共用水平轴**——浮层在 anchor 的上方或下方,水平方向再挤压也只是左右滑动,不会撞上 anchor

### 5.4 主轴 vs 交叉轴:更通用的视角

回到生产级库 [Floating UI](https://floating-ui.com/),它把这两种策略**显式拆成两个 middleware**:

```tsx
useFloating({
  placement: 'top',
  middleware: [
    offset(8),
    flip(),    // 第一道防线:翻方向
    shift(),   // 第二道防线:挤压(本质是 clamp)
  ],
});
```

这两个 middleware 的分工:

| Middleware | 处理哪个方向 | 等价操作 |
|---|---|---|
| `flip()` | **主轴**(浮层和 anchor 排布的方向) | 翻转方向 |
| `shift()` | **交叉轴**(垂直于主轴的方向) | clamp 挤压 |

如果 `placement: 'top'`(浮层在上方),那:

- 主轴 = 垂直 → flip 处理(上↔下翻转)
- 交叉轴 = 水平 → shift 处理(左右挤压,clamp)

如果 `placement: 'left'`(浮层在左侧),那就反过来:

- 主轴 = 水平 → flip 处理(左↔右翻转)
- 交叉轴 = 垂直 → shift 处理(上下挤压,clamp)

**所以"哪个方向用 flip、哪个方向用 clamp"不是看物理方向,而是看相对于 anchor 的"主轴/交叉轴"关系**。

### 5.5 那垂直方向的"贴底"算什么?

回到代码看垂直方向的最后一段:

```ts
if (top + floatRect.height > vh - margin) {
  top = vh - floatRect.height - margin;  // 等价于 Math.min(top, vh - h - margin)
}
```

这其实就是 clamp 的上界部分——只是因为前面的 `if (top < margin) flip` 已经处理了下界(翻到下方),所以这里只需要补上界。

如果硬要写成对称形式,完整版应该是:

```ts
top = Math.max(margin, Math.min(top, vh - floatRect.height - margin));
```

但这样就**丢失了 flip 信息**——浮层只是贴边而不是翻方向。所以工程上写成 `if (...) flip → if (...) clamp` 的两段式,是为了保留**优先级语义**:**先尝试 flip,失败才 clamp 兜底**。

### 5.6 心法

> **主轴(浮层和 anchor 排布的方向)优先 flip,因为直接 clamp 会让浮层盖住 anchor;**
> **交叉轴(垂直于主轴的方向)直接 clamp 即可,因为 clamp 不会造成遮挡。**

这是浮层定位算法里一条核心设计决策——理解了它,你看 Floating UI 的 `flip` / `shift` middleware 源码时,就知道它们各自在做什么、为什么这样分工。

---

## 六、第三个坑:滚动和窗口尺寸变化

浮层显示期间,如果用户滚动页面或调整窗口大小,坐标会失效。需要监听这些事件并重新计算:

```tsx
useLayoutEffect(() => {
  if (!visible) return;
  
  const update = () => {
    // ...计算坐标的逻辑
    setCoords({ left, top });
  };
  
  update();  // 初次计算
  
  // 监听变化
  window.addEventListener('scroll', update, true);  // 第三个参数 true 很关键!
  window.addEventListener('resize', update);
  
  return () => {
    window.removeEventListener('scroll', update, true);
    window.removeEventListener('resize', update);
  };
}, [visible, offset]);
```

### 为什么 scroll 监听要传 `true`?

这是个**经常被忽略的关键细节**。`addEventListener` 的第三个参数控制事件监听阶段:

| 第三个参数 | 监听阶段 | 能抓到的事件 |
|---|---|---|
| `false`(默认) | **冒泡阶段** | 只能接收到 `window` 自身的滚动 |
| `true` | **捕获阶段** | 能接收到**所有**祖先元素的滚动 |

**为什么重要**:如果 anchor 在一个内部可滚动容器里(比如一个 `overflow: auto` 的 div),用户滚动那个容器时**不会触发 `window` 的 scroll 事件**,但 anchor 的视口位置确实变了。捕获阶段监听能抓到这种"内部滚动",保证浮层跟着 anchor 一起动。

> 这是 DOM 事件模型("捕获 → 目标 → 冒泡"三阶段)在工程中的实际应用。理解事件冒泡和捕获,在写 React 之外的原生 JS 时也极其有用。

---

## 七、第四个坑:浮层尺寸变化

如果浮层内容是动态的(比如异步加载文本、用户输入),浮层尺寸会变,但 scroll/resize 监听抓不到。这时需要 `ResizeObserver`:

```tsx
const ro = new ResizeObserver(update);
ro.observe(float);
ro.observe(anchor);

// 清理时:
ro.disconnect();
```

**`ResizeObserver` 的优势**:

- 比定时器(setInterval 检查尺寸)性能好得多
- 比 MutationObserver 更精准(只关心尺寸变化)
- 现代浏览器普遍支持(IE 不支持,但前端基本可以放弃 IE 了)

---

## 八、生产级完整版

把所有要点整合起来:

```tsx
import { useState, useLayoutEffect, useCallback, RefObject } from 'react';

type Coords = { left: number; top: number } | null;

export function useAnchorPosition(
  anchorRef: RefObject<HTMLElement | null>,
  floatRef: RefObject<HTMLElement | null>,
  visible: boolean,
  offset: number = 8
): Coords {
  const [coords, setCoords] = useState<Coords>(null);

  // 计算函数提取出来,在 effect 内复用
  const update = useCallback(() => {
    const anchor = anchorRef.current;
    const float = floatRef.current;
    if (!anchor || !float) return;

    const anchorRect = anchor.getBoundingClientRect();
    const floatRect = float.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;

    // 默认上方居中
    let left = anchorRect.left + anchorRect.width / 2 - floatRect.width / 2;
    let top = anchorRect.top - floatRect.height - offset;

    // 上方放不下,翻到下方
    if (top < margin) {
      top = anchorRect.bottom + offset;
    }

    // 水平方向 clamp 到视口内
    left = Math.max(margin, Math.min(left, vw - floatRect.width - margin));

    // 极端情况:下方也超了,贴底
    if (top + floatRect.height > vh - margin) {
      top = vh - floatRect.height - margin;
    }

    setCoords({ left, top });
  }, [anchorRef, floatRef, offset]);

  useLayoutEffect(() => {
    if (!visible) {
      setCoords(null);  // 隐藏时清空,下次显示重新算
      return;
    }

    update();

    const anchor = anchorRef.current;
    const float = floatRef.current;
    if (!anchor || !float) return;

    // 监听浮层和 anchor 自身的尺寸变化
    const ro = new ResizeObserver(update);
    ro.observe(float);
    ro.observe(anchor);

    // 监听滚动(捕获阶段,以抓到祖先容器滚动)
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);

    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [visible, update, anchorRef, floatRef]);

  return coords;
}
```

### 配套的 Tooltip 调整

因为 hook 现在返回 `Coords | null`,父组件渲染要稍作调整:

```tsx
function Content({ children }: { children: ReactNode }) {
  const { visible, floatRef, coords } = useTooltipContext();
  if (!visible) return null;
  
  return createPortal(
    <PositionedLayer 
      ref={floatRef} 
      left={coords?.left ?? 0} 
      top={coords?.top ?? 0}
      style={{ visibility: coords ? 'visible' : 'hidden' }}
    >
      <TooltipBox>{children}</TooltipBox>
    </PositionedLayer>,
    document.body
  );
}
```

第一次渲染时 `coords` 是 null,浮层不可见但已挂载到 DOM,`useLayoutEffect` 测量后 setState,下一帧浮层带着正确坐标显示出来。整个过程用户感知不到闪烁。

---

## 九、关键 Web API 速查

这个 hook 用到的几个 API,在做任何"位置/尺寸"相关的需求时都会用到:

| API | 作用 | 关键点 |
|---|---|---|
| `getBoundingClientRect()` | 获取元素相对**视口**的位置和尺寸 | 返回 `top/left/right/bottom/width/height`;受 transform 影响 |
| `ResizeObserver` | 监听元素尺寸变化 | 比定时器/MutationObserver 性能好得多 |
| `IntersectionObserver` | 监听元素是否进入视口 | 可用于"anchor 不可见时自动隐藏浮层" |
| `useLayoutEffect` | 浏览器绘制前同步执行 | 测量+调整 DOM 时必用,避免闪烁 |
| `addEventListener('scroll', fn, true)` | 捕获阶段监听全局滚动 | 第三个参数 `true` 才能抓到祖先容器滚动 |

---

## 十、踩过的坑总结

把这个 hook 演进过程中遇到的坑列成一张清单,以后写类似 hook 时可以对照检查:

| # | 坑 | 解法 |
|---|---|---|
| 1 | `useEffect` 导致浮层闪烁 | 改用 `useLayoutEffect` |
| 2 | 第一次渲染 `floatRef.current` 还没挂载 | `coords = null` + `visibility: hidden` 占位 |
| 3 | 浮层超出屏幕顶部 | flip 策略:翻到下方 |
| 4 | 浮层超出屏幕左右 | shift 策略:水平 clamp |
| 5 | 主轴用 clamp 会盖住 anchor | 主轴优先 flip,交叉轴才 clamp |
| 6 | 滚动时浮层不跟随 | 监听 scroll + resize |
| 7 | 内部容器滚动抓不到 | scroll 监听用捕获阶段(`true`) |
| 8 | 浮层内容尺寸变化抓不到 | `ResizeObserver` 监听 float 和 anchor |
| 9 | 浮层隐藏后下次显示有旧坐标残留 | `visible = false` 时 reset coords |
| 10 | 事件监听忘记清理 | `useLayoutEffect` 返回清理函数 |

---

## 十一、不重复造轮子:Floating UI

上面这个 hook 已经能用,但生产环境会碰到更多边界情况:

- iframe 里怎么算坐标?
- 浮层有箭头时箭头位置怎么对齐?
- RTL 布局(阿拉伯语等右到左排版)怎么处理?
- 多个浮层堆叠时怎么避让?
- anchor 被父容器 `overflow: hidden` 截断时怎么处理?
- 移动端虚拟键盘弹起改变视口高度怎么办?

这些问题已经被社区解决得很好。**生产项目强烈推荐用 [Floating UI](https://floating-ui.com/)**(原 Popper.js),它的 React 适配 `@floating-ui/react` 提供了完全可组合的 middleware:

```tsx
import { useFloating, flip, shift, offset, arrow } from '@floating-ui/react';

function Tooltip() {
  const arrowRef = useRef(null);
  const { refs, floatingStyles, middlewareData } = useFloating({
    placement: 'top',
    middleware: [
      offset(8),
      flip(),
      shift({ padding: 8 }),
      arrow({ element: arrowRef }),
    ],
  });
  // ...
}
```

每个 middleware 解决一个边界问题:

| Middleware | 作用 |
|---|---|
| `offset` | 距离 anchor 的间距 |
| `flip` | 放不下时翻转方向 |
| `shift` | 挤压到视口内 |
| `arrow` | 计算箭头位置 |
| `size` | 根据可用空间调整浮层尺寸 |
| `autoPlacement` | 自动选最佳方向 |
| `hide` | anchor 被遮住时自动隐藏 |

按需组合即可。

---

## 十二、为什么还要自己手写一遍?

既然有 Floating UI,为什么不直接用?

**自己手写 hook 的价值在于学习和理解**——掌握这些原理后:

1. **不再把 Floating UI 当黑盒**——知道 `flip` 内部大概在干什么
2. **出 bug 时知道往哪查**——浮层位置不对,能定位是测量问题、监听问题还是计算问题
3. **扩展需求时知道怎么写 middleware**——Floating UI 的 middleware 接口本质就是"在已有 coords 上做修正"
4. **简单场景不用引入额外依赖**——3KB 的库 vs 50 行手写 hook,自己掌控更轻量

> 这正是"先理解原理,再用工业级工具,出问题时能下沉解决"的工程思路——和学习操作系统、网络协议、CGI 等底层知识的逻辑是一样的。

---

## 十三、心法总结

1. **测量 DOM 用 `useLayoutEffect`**——`useEffect` 会闪烁
2. **首次渲染 ref 还没挂载**——用 `null + visibility: hidden` 占位
3. **scroll 监听记得加 `true`**——否则抓不到内部容器滚动
4. **尺寸变化用 `ResizeObserver`**——别用定时器轮询
5. **隐藏时 reset 状态**——避免下次显示出现旧值
6. **清理函数别忘**——监听器、Observer 都要 disconnect
7. **主轴用 flip,交叉轴用 clamp**——直接 clamp 主轴会让浮层盖住 anchor
8. **clamp 是通用模式**——`Math.max(min, Math.min(value, max))` 在任何"限制范围"场景都能用
9. **生产用 Floating UI**——但要先懂原理

---

## 十四、一句话总结

> **`useAnchorPosition` 的本质是"在合适时机测量 DOM,算出坐标,并对一切可能改变坐标的事件做出响应"。`useLayoutEffect` 解决时机问题,`getBoundingClientRect` 解决测量问题,scroll/resize/ResizeObserver 解决响应问题——三件事凑齐,就是一个能用的浮层定位 hook。**

---

## 十五、扩展阅读方向

- **Floating UI 文档**: 工业级浮层库的完整 API 和最佳实践
- **`useImperativeHandle`**: 让父组件主动调用子组件方法,有时定位逻辑会用到
- **`React.startTransition`**: 配合定位计算,把非关键更新延后处理
- **CSS Anchor Positioning**: 浏览器原生支持的浮层定位 API(2024 年起 Chrome 支持),未来可能取代大部分 JS 定位库
- **Portal 的渲染时机**: `createPortal` 子树的生命周期细节
- **DOM 事件三阶段**: 捕获 → 目标 → 冒泡,理解后能解决一大类"事件抓不到"的问题
