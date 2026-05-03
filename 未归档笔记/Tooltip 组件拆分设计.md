---
tags:
  - react
  - typescript
  - 前端组件
  - tooltip
created: 2026-04-24
---

# Tooltip 组件拆分设计

## 需求

写一个 React + TypeScript 的 Tooltip 组件:

- 传入文字,返回一个问号 icon
- 鼠标悬浮 icon 时显示文字框
- 文字框显示在 icon 上方(根据 icon 位置定位,不跟随鼠标)
- Icon 和文字框分别拆成独立组件,外层各包一层 div 用于定位

## 完整代码

```tsx
// Tooltip.tsx
import { useState, useRef, useEffect, ReactNode } from "react";
import { createPortal } from "react-dom";

/* ---------------- 纯展示:问号 Icon ---------------- */
interface QuestionIconProps {
  size?: number;
}

function QuestionIcon({ size = 16 }: QuestionIconProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        border: "1px solid currentColor",
        fontSize: size * 0.7,
        fontWeight: 600,
        cursor: "help",
        color: "#6b7280",
        userSelect: "none",
        lineHeight: 1,
      }}
      aria-label="More information"
    >
      ?
    </span>
  );
}

/* ---------------- 纯展示:文字框 ---------------- */
interface TooltipBoxProps {
  children: ReactNode;
}

function TooltipBox({ children }: TooltipBoxProps) {
  return (
    <div
      role="tooltip"
      style={{
        maxWidth: 280,
        padding: "8px 12px",
        borderRadius: 6,
        background: "rgba(17, 24, 39, 0.95)",
        color: "#fff",
        fontSize: 13,
        lineHeight: 1.5,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {children}
    </div>
  );
}

/* ---------------- 容器:负责定位和交互 ---------------- */
interface TooltipProps {
  text: ReactNode;
  iconSize?: number;
  offset?: number;
  className?: string;
}

export function Tooltip({
  text,
  iconSize = 16,
  offset = 8,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ left: 0, top: 0 });
  const iconWrapRef = useRef<HTMLSpanElement>(null);
  const tooltipWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || !iconWrapRef.current || !tooltipWrapRef.current) return;

    const iconRect = iconWrapRef.current.getBoundingClientRect();
    const tipRect = tooltipWrapRef.current.getBoundingClientRect();
    const vw = window.innerWidth;

    let left = iconRect.left + iconRect.width / 2 - tipRect.width / 2;
    let top = iconRect.top - tipRect.height - offset;

    if (left < 8) left = 8;
    if (left + tipRect.width > vw - 8) left = vw - tipRect.width - 8;
    if (top < 8) top = iconRect.bottom + offset;

    setCoords({ left, top });
  }, [visible, offset]);

  return (
    <>
      {/* icon 外层定位容器 */}
      <span
        ref={iconWrapRef}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className={className}
        style={{ display: "inline-flex" }}
      >
        <QuestionIcon size={iconSize} />
      </span>

      {/* 文字框外层定位容器 */}
      {visible &&
        createPortal(
          <div
            ref={tooltipWrapRef}
            style={{
              position: "fixed",
              left: coords.left,
              top: coords.top,
              zIndex: 9999,
            }}
          >
            <TooltipBox>{text}</TooltipBox>
          </div>,
          document.body
        )}
    </>
  );
}
```

## 拆分后的职责

| 组件 | 职责 | 知道定位吗 |
|------|------|----------|
| `QuestionIcon` | 画一个问号圆圈 | ❌ 纯展示 |
| `TooltipBox` | 画一个深色文字框 | ❌ 纯展示 |
| `Tooltip` | 交互 + 定位 + 组装 | ✅ 只有这一层知道 |

## 关键设计点

### 1. Icon 外层用 `<span>` 包

因为 icon 本身是 inline 元素,外层用 `span` 保持 inline 行为,不会破坏父级文本流。

### 2. 文字框外层用 `<div>` 包

Portal 到 body 里,脱离文档流,`div` 最合适。

### 3. 展示组件零定位知识

`QuestionIcon` 和 `TooltipBox` 完全不知道对方的存在,也不知道自己会被放在哪里。以后想换成别的 icon(比如 `lucide-react` 的 `HelpCircle`)或者换一个 tooltip 样式(比如浅色主题、带箭头),只改对应的小组件就行,定位逻辑完全不用动。

### 4. 交互绑在外层容器上

`mouseenter` / `mouseleave` 绑在外层 `span`,不是 `QuestionIcon` 内部,这样 icon 组件保持纯净,交互归容器管。

### 5. 用 `createPortal` 渲染到 body

避免被父级的 `overflow: hidden` 或 `z-index` 裁掉。

### 6. 定位算法

```
水平: iconRect.left + iconRect.width / 2 - tipRect.width / 2   // icon 中心对齐 tooltip 中心
垂直: iconRect.top - tipRect.height - offset                    // icon 上方
```

### 7. 边界保护

- 左右: 如果超出视口 8px 边距,贴边显示
- 上方: 如果上方放不下,翻转到 icon 下方

## 用法示例

```tsx
<div>
  用户名
  <Tooltip text="用户名需要 3-20 个字符,只能包含字母数字下划线" />
</div>
```

## 可能的扩展方向

- **显示延迟**: 悬浮 300ms 才显示,避免鼠标划过时闪烁
- **首帧闪烁**: 用 `ready` state + `opacity` 避免位置算好前的闪烁
- **替换 icon**: 换成 `lucide-react` 的 `HelpCircle` / `Info`
- **带箭头指向**: `TooltipBox` 加一个小三角指向 icon
- **浅色主题变体**: 给 `TooltipBox` 加 `variant` prop

## 设计改善（对照容器/展示分层理论）

对照 [[组件拆分 - 容器组件与展示组件]] 的理论，现有设计已完成基础分层，但仍有 4 处值得改进。

---

### 问题一：容器 hardcode 了 `QuestionIcon`（最核心）

**现状：**
```tsx
// Tooltip 容器里写死了展示组件
<QuestionIcon size={iconSize} />
```

**问题：** 容器不应该决定「用哪个展示组件渲染 trigger」。现在想换成 `lucide-react` 的 `HelpCircle`，必须改容器内部——「展示组件自由替换」的原则被违反了。

**改善：** 把 trigger 改成 `children` slot，容器完全不知道外面传的是什么元素：

```tsx
// 改善后：容器接口去掉 iconSize，改用 children
interface TooltipProps {
  text: ReactNode;
  children: ReactNode;  // trigger slot，接受任意元素
  offset?: number;
  className?: string;
}

// 调用方自己决定 trigger 长什么样
<Tooltip text="用户名需要 3-20 个字符">
  <QuestionIcon size={16} />
</Tooltip>

// 想换图标？直接换，容器零改动
<Tooltip text="用户名需要 3-20 个字符">
  <HelpCircle size={14} color="#6b7280" />
</Tooltip>
```

---

### 问题二：`iconSize` 是展示细节泄漏到容器接口

**现状：**
```tsx
interface TooltipProps {
  iconSize?: number;  // ← QuestionIcon 的内部展示参数
}
```

**问题：** 容器的 props 暴露了子展示组件的内部参数，违反了「props 只接受数据形状」的原则。把问题一修掉（改用 `children`）之后，`iconSize` 自然消失——调用方在传 `children` 时自行控制尺寸：

```tsx
// ✅ 展示细节留在展示层，容器看不到
<Tooltip text="说明">
  <QuestionIcon size={20} />
</Tooltip>
```

---

### 问题三：定位算法应提取为 Custom Hook

**现状：** `Tooltip` 容器里同时做了三件事：
1. `visible` 状态 + 鼠标事件
2. `useEffect` 里的坐标计算算法
3. Portal 渲染 + 组装展示组件

**问题：** 坐标计算是一段纯逻辑，和渲染无关，可以独立复用（Dropdown、Popover 需要同样的算法）。按照「Hooks 时代等价写法」，逻辑应提取到 hook 里。

**改善：** 提取 `useAnchorPosition`：

```tsx
function useAnchorPosition(
  anchorRef: RefObject<Element | null>,
  floatRef: RefObject<Element | null>,
  visible: boolean,
  offset: number
) {
  const [coords, setCoords] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!visible || !anchorRef.current || !floatRef.current) return;

    const anchorRect = anchorRef.current.getBoundingClientRect();
    const floatRect  = floatRef.current.getBoundingClientRect();
    const vw = window.innerWidth;

    let left = anchorRect.left + anchorRect.width / 2 - floatRect.width / 2;
    let top  = anchorRect.top  - floatRect.height - offset;

    if (left < 8) left = 8;
    if (left + floatRect.width > vw - 8) left = vw - floatRect.width - 8;
    if (top  < 8) top  = anchorRect.bottom + offset;

    setCoords({ left, top });
  }, [visible, offset]);

  return coords;
}
```

---

### 问题四：Portal 内的定位 `<div>` 是容器在写样式

**现状：**
```tsx
// 容器 JSX 里直接写了样式
<div
  ref={tooltipWrapRef}
  style={{
    position: "fixed",   // ← 容器在写 CSS
    left: coords.left,
    top: coords.top,
    zIndex: 9999,        // ← 魔法数字内嵌在容器里
  }}
>
```

**问题：** 「容器不写样式」是理论里的硬边界。这个 `position: fixed + zIndex` 的 div 有明确的样式语义，应提取为展示组件 `PositionedLayer`：

```tsx
interface PositionedLayerProps {
  left: number;
  top: number;
  children: ReactNode;
}

const PositionedLayer = forwardRef<HTMLDivElement, PositionedLayerProps>(
  function PositionedLayer({ left, top, children }, ref) {
    return (
      <div ref={ref} style={{ position: "fixed", left, top, zIndex: 9999 }}>
        {children}
      </div>
    );
  }
);
```

---

### 改善后的完整代码

```tsx
// Tooltip.v2.tsx
import { useState, useRef, useEffect, forwardRef, RefObject, ReactNode } from "react";
import { createPortal } from "react-dom";

/* -------- 展示：问号 Icon（不变） -------- */
function QuestionIcon({ size = 16 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: size, height: size, borderRadius: "50%",
        border: "1px solid currentColor", fontSize: size * 0.7,
        fontWeight: 600, cursor: "help", color: "#6b7280",
        userSelect: "none", lineHeight: 1,
      }}
      aria-label="More information"
    >?</span>
  );
}

/* -------- 展示：文字框（不变） -------- */
function TooltipBox({ children }: { children: ReactNode }) {
  return (
    <div
      role="tooltip"
      style={{
        maxWidth: 280, padding: "8px 12px", borderRadius: 6,
        background: "rgba(17, 24, 39, 0.95)", color: "#fff",
        fontSize: 13, lineHeight: 1.5, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        pointerEvents: "none", whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}
    >{children}</div>
  );
}

/* -------- 展示：fixed 定位包裹层（新增） -------- */
const PositionedLayer = forwardRef<HTMLDivElement, { left: number; top: number; children: ReactNode }>(
  function PositionedLayer({ left, top, children }, ref) {
    return (
      <div ref={ref} style={{ position: "fixed", left, top, zIndex: 9999 }}>
        {children}
      </div>
    );
  }
);

/* -------- Hook：坐标计算（从容器提取） -------- */
function useAnchorPosition(
  anchorRef: RefObject<Element | null>,
  floatRef: RefObject<Element | null>,
  visible: boolean,
  offset: number
) {
  const [coords, setCoords] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!visible || !anchorRef.current || !floatRef.current) return;

    const anchorRect = anchorRef.current.getBoundingClientRect();
    const floatRect  = floatRef.current.getBoundingClientRect();
    const vw = window.innerWidth;

    let left = anchorRect.left + anchorRect.width / 2 - floatRect.width / 2;
    let top  = anchorRect.top  - floatRect.height - offset;

    if (left < 8) left = 8;
    if (left + floatRect.width > vw - 8) left = vw - floatRect.width - 8;
    if (top  < 8) top  = anchorRect.bottom + offset;

    setCoords({ left, top });
  }, [visible, offset]);

  return coords;
}

/* -------- 容器：纯胶水层（改善后） -------- */
interface TooltipProps {
  text: ReactNode;
  children: ReactNode;  // trigger slot，不再 hardcode QuestionIcon
  offset?: number;
  className?: string;
}

export function Tooltip({ text, children, offset = 8, className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const floatRef  = useRef<HTMLDivElement>(null);

  // 定位算法完全在 hook 里，容器本身看不到算法细节
  const coords = useAnchorPosition(anchorRef, floatRef, visible, offset);

  return (
    <>
      <span
        ref={anchorRef}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className={className}
        style={{ display: "inline-flex" }}
      >
        {children}
      </span>

      {visible && createPortal(
        <PositionedLayer ref={floatRef} left={coords.left} top={coords.top}>
          <TooltipBox>{text}</TooltipBox>
        </PositionedLayer>,
        document.body
      )}
    </>
  );
}
```

---

### 改善后的职责总览

| 层次   | 单元                  | 职责            | 知道样式？ | 知道算法？ | 知道谁是 trigger？ |
| ---- | ------------------- | ------------- | ----- | ----- | ------------- |
| 展示   | `QuestionIcon`      | 画问号圆圈         | ✅     | ❌     | ❌             |
| 展示   | `TooltipBox`        | 画深色文字框        | ✅     | ❌     | ❌             |
| 展示   | `PositionedLayer`   | fixed 定位包裹    | ✅     | ❌     | ❌             |
| Hook | `useAnchorPosition` | 坐标计算 + 边界保护   | ❌     | ✅     | ❌             |
| 容器   | `Tooltip`           | 绑事件、调 hook、组装 | ❌     | ❌     | ❌             |

---

### 改善后的用法

```tsx
// 默认用法——自带问号图标
<Tooltip text="用户名需要 3-20 个字符，只能包含字母数字下划线">
  <QuestionIcon size={16} />
</Tooltip>

// 替换 trigger——容器零改动
<Tooltip text="这是帮助说明">
  <HelpCircle size={14} color="#6b7280" />
</Tooltip>

// 任意元素都能作 trigger
<Tooltip text="点击了解更多">
  <span style={{ textDecoration: "underline dotted", cursor: "help" }}>
    了解更多
  </span>
</Tooltip>
```

---

### 改善前后对比

| 问题 | 改善前 | 改善后 |
|------|--------|--------|
| trigger 耦合 | 容器 hardcode `<QuestionIcon>` | `children` slot，容器不知道具体元素 |
| 展示细节泄漏 | `iconSize` 出现在容器 props | 移除，由调用方自行传给展示组件 |
| 定位算法 | 内嵌在容器 `useEffect` | 提取为 `useAnchorPosition` hook |
| 容器写样式 | `position: fixed / zIndex` 写在容器 JSX | 提取为 `PositionedLayer` 展示组件 |

---

## 延伸：`forwardRef` 的特殊签名

改善后的 `PositionedLayer` 用了 `forwardRef`，它的类型和参数结构看起来很「不对称」：

```tsx
const PositionedLayer = forwardRef<HTMLDivElement, { left: number; top: number; children: ReactNode }>(
  function PositionedLayer({ left, top, children }, ref) {
    return (
      <div ref={ref} style={{ position: "fixed", left, top, zIndex: 9999 }}>
        {children}
      </div>
    );
  }
);
```

几个自然的疑问：
- 为什么 `ref` 不在 props 类型 `{ left, top, children }` 里？
- 为什么 `ref` 不在第一个大括号里和其他三个参数一起解构？

---

### 1. `ref` 是 React 拦截的「特殊 prop」

写 `<Child ref={x} />` 时，React **不会**把 `ref` 放进 `props` 对象里，而是在内部拦截、交给特殊机制处理：

```tsx
function Child(props) {
  console.log(props.ref);  // ❌ undefined —— 被 React 吃掉了
}
```

这是 React 长期以来的保留行为（和 `key` 一样），所以普通函数组件根本拿不到 `ref`。

---

### 2. `forwardRef` 的作用就是「把被吃掉的 ref 捞回来」

它要求回调函数必须是 **2 个参数**的特殊签名：

```tsx
forwardRef<RefType, PropsType>((props, ref) => { ... })
//                              │      │
//                              │      └─ React 走后门单独塞进来的第二个参数
//                              └─ 正常的 props 对象
```

这就是为什么 `ref` 不和 `left / top / children` 在同一个大括号里——它**根本不属于 props**，是 React 走"第二个参数"后门传进来的。

---

### 3. 类型由泛型描述，注意顺序反直觉

```tsx
// React 的类型定义简化版
function forwardRef<T, P>(
  render: (props: P, ref: Ref<T>) => ReactElement
): ...
```

泛型顺序：**`<T, P>` = `<RefType, PropsType>`**，**Ref 类型在前，Props 类型在后**（反直觉，但 API 就是这样）。

对照代码：

```tsx
const PositionedLayer = forwardRef<
  HTMLDivElement,                                         // T: ref 指向的 DOM 类型
  { left: number; top: number; children: ReactNode }      // P: 真正的 props 类型
>(
  function PositionedLayer({ left, top, children }, ref) {
  //                       └──────── P ────────┘   └─ T ─┘
  //                       解构 props              独立拿到 ref
  }
);
```

| 名字 | 哪来的 | 类型在哪里声明 |
|------|--------|--------------|
| `left / top / children` | props 对象 | 第 2 个泛型 `P` |
| `ref` | React 走后门传的第二个参数 | 第 1 个泛型 `T`（自动推导成 `Ref<T>`） |

---

### 4. 等价的完整写法（让结构更直观）

```tsx
interface PositionedLayerProps {
  left: number;
  top: number;
  children: ReactNode;
}

const PositionedLayer = forwardRef<HTMLDivElement, PositionedLayerProps>(
  function PositionedLayer(
    { left, top, children }: PositionedLayerProps,   // props
    ref: ForwardedRef<HTMLDivElement>                 // ref（React 塞进来的）
  ) {
    return (
      <div ref={ref} style={{ position: "fixed", left, top, zIndex: 9999 }}>
        {children}
      </div>
    );
  }
);
```

---

### 5. 为什么要这样设计？

因为 `ref` 的语义和 props 完全不同：

| 维度 | 普通 props | `ref` |
|------|-----------|-------|
| 用途 | 传递数据 / 回调 | 拿到 DOM 节点或组件实例的引用 |
| 行为 | 触发重渲染 | 不参与 reconciliation |
| JSX 语法上 | `<Child foo={x} />` | `<Child ref={x} />` —— 看起来一样 |
| 是否作为 `props` 属性传入函数 | ✅ | ❌（被 React 拦截） |

React 想保留 `ref={x}` 这个大家习惯的写法，又不想它污染 props 对象，就搞出了 `forwardRef` 这个"拆成两个参数"的 API。

---

### 6. React 19 之后这个尴尬被修好了

在 **React 19** 中，`ref` 变成了普通 prop，`forwardRef` 不再必要：

```tsx
// React 19+ 的写法：ref 就是普通 prop
interface PositionedLayerProps {
  left: number;
  top: number;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;   // ← 直接写在 props 里
}

function PositionedLayer({ left, top, children, ref }: PositionedLayerProps) {
  //                                              ^^^ 正常解构
  return (
    <div ref={ref} style={{ position: "fixed", left, top, zIndex: 9999 }}>
      {children}
    </div>
  );
}
```

所以你看到的「不对称」其实是 React 18 以前遗留的设计妥协，团队自己也觉得别扭，已经在 19 里统一了。

---

> [!tip] 一句话总结
> `ref` **不在 props 大括号里、也不在 props 类型里**，是因为它**根本不是 prop**——它是 React 走"第二个参数"后门单独传进来的，类型由 `forwardRef` 的第一个泛型声明。React 19 起可以当普通 prop 用，这种不对称就消失了。

---

## 延伸：`PositionedLayer` 的 div 为什么会被 children 撑大？

`PositionedLayer` 的 div 没有声明 `width`，却能精确贴合 `TooltipBox` 的大小。这依赖一个容易被忽略的 CSS 规则。

### 核心规则：`position: fixed` 让 `width: auto` 的行为翻转

| 场景 | `width: auto` 的含义 |
|------|--------------------|
| 普通 block 元素（默认） | **填满父容器**（等于容器宽度） |
| `position: fixed` / `absolute` | **被 children 撑开**（shrink-to-fit） |
| `display: inline-block` / `inline-flex` | **被 children 撑开** |
| `float: left` / `right` | **被 children 撑开** |

一旦元素脱离正常文档流（fixed / absolute / float / inline-block），CSS 规范就会切换到叫做 **「shrink-to-fit width」** 的宽度算法——**由内容决定宽度，而不是由父容器决定**。

所以这段代码：

```tsx
<div ref={ref} style={{ position: "fixed", left, top, zIndex: 9999 }}>
  {children}   {/* TooltipBox */}
</div>
```

因为有 `position: fixed`，这个 div **不会**撑满视口，而是恰好被 `TooltipBox` 撑到它真实需要的大小（比如 240px 宽），高度也由内容决定。

---

### 为什么这件事对 Tooltip 至关重要

`useAnchorPosition` 里有这段关键代码：

```tsx
const floatRect = floatRef.current.getBoundingClientRect();
// ...
let left = anchorRect.left + anchorRect.width / 2 - floatRect.width / 2;
//                                                  ^^^^^^^^^^^^^^^^
//                                                  需要 tooltip 的真实宽度
```

**定位算法依赖「tooltip 的真实内容宽度」来做水平居中。**

如果这个外层 div 没有 `position: fixed`（或者错误地写成 `width: 100%`），那 `floatRect.width` 就会是视口宽度（例如 1440px），居中计算会把 tooltip 推到屏幕外。

正是因为 `position: fixed` 触发了 shrink-to-fit，外层 div 的宽度 = `TooltipBox` 的宽度，坐标算法才能正确工作。

---

### 直观演示对比

```tsx
// ❌ 如果没有 position: fixed
<div>
  <TooltipBox>短文本</TooltipBox>
</div>
// ──────────────────────────────────
// div 宽度 = 父容器宽度（例如 1440px）
// ──────────────────────────────────

// ✅ 有 position: fixed（现在的代码）
<div style={{ position: "fixed" }}>
  <TooltipBox>短文本</TooltipBox>
</div>
//   ┌────────────┐
//   │ TooltipBox │   ← div 宽度被内容撑到 ~100px
//   └────────────┘
```

---

### `TooltipBox` 的 `maxWidth: 280` 在这里起什么作用？

```tsx
function TooltipBox({ children }) {
  return (
    <div role="tooltip" style={{ maxWidth: 280, /* ... */ }}>
      {children}
    </div>
  );
}
```

`maxWidth: 280` 是**内容层面的宽度约束**：

- 文本短时：`TooltipBox` 实际宽度 = 文本宽度 + padding（小于 280）
- 文本长时：`TooltipBox` 宽度 = 280px，超出部分换行

无论哪种情况，外层 `PositionedLayer` 都会被 `TooltipBox` 的实际宽度精确撑开，因此 `getBoundingClientRect()` 测出的宽度始终准确。

---

### 触发 shrink-to-fit 的所有情况（小抄）

```css
/* 以下任何一种都会让元素「被 children 撑大」而不是「填满父容器」 */

position: absolute;    /* 脱离文档流 */
position: fixed;       /* 脱离文档流 */
float: left | right;   /* 浮动 */
display: inline-block;
display: inline-flex;
display: inline-grid;
display: table;        /* 不带 table-layout: fixed */
width: fit-content;    /* 显式声明 */
width: max-content;    /* 显式声明 */
```

---

> [!tip] 一句话总结
> `position: fixed` 会触发 CSS 的 **shrink-to-fit** 宽度算法，让 `width: auto` 从"填满父级"翻转成"被 children 撑大"。`PositionedLayer` 正是利用这个特性，保证 `getBoundingClientRect()` 能读到 tooltip 的真实内容宽度，定位算法才能正确居中。

---

## 延伸：看起来像循环依赖的问题，其实不是

常见疑问：**`visible` 一开始是 `false`，鼠标进入后变成 `true`，但此时 `TooltipBox` 还没渲染，却要根据它的大小算坐标——不会死循环或报错吗？**

不会。理解这一点需要看清楚 React 的 **「Render → Commit → Effect」** 三阶段时序。

---

### 错误的心智模型

很多人以为是这样的：
```
setVisible(true)
  ↓
立刻执行 useEffect 算坐标  ← 此时 floatRef 是 null，会报错！
  ↓
最后渲染 tooltip
```

---

### 真实的 React 时序

```
① setVisible(true)
  ↓
② Render 阶段：React 调用组件函数，计算出新的虚拟 DOM
  ↓
③ Commit 阶段：React 把新 DOM 真正插入页面
   - <PositionedLayer> 被创建出来（位置在 {0, 0}，coords 还是初始值）
   - floatRef.current 被赋值为这个 div  ← 关键！ref 在这里就绑好了
  ↓
④ Effect 阶段：useEffect 才开始执行
   - floatRef.current 已经存在 ✓
   - getBoundingClientRect() 能测到真实宽高
   - setCoords({...}) 触发第二次渲染
  ↓
⑤ 第二次 Render：用正确的 coords 更新 DOM 位置
```

**核心洞察：tooltip 会被先渲染，然后才被测量，最后才定位。** 顺序反过来才会死循环，React 的设计从一开始就避免了这个问题。

---

### 逐帧拆解

**帧 1：初始状态**
```tsx
visible = false
coords  = { left: 0, top: 0 }

// 渲染输出：只有 anchor
<span ref={anchorRef}>...</span>
// portal 不渲染

// effect 命中 early return
if (!visible || ...) return;
```

**帧 2：鼠标进入，`setVisible(true)` 触发重渲染**
```tsx
visible = true
coords  = { left: 0, top: 0 }   // ← 仍是旧值

// 渲染输出：portal 登场
{createPortal(
  <PositionedLayer ref={floatRef} left={0} top={0}>  // ⚠️ 在 (0, 0)
    <TooltipBox>...</TooltipBox>
  </PositionedLayer>,
  document.body
)}
```
这一帧结束后：
- DOM 里多了一个 tooltip 节点，位置在屏幕左上角 `(0, 0)`
- `floatRef.current` 被 React 填上
- **浏览器此时可能已经把这一帧画到屏幕上了** ← 闪烁来源

**帧 3：Effect 跑起来**
```tsx
useEffect(() => {
  if (!visible || !anchorRef.current || !floatRef.current) return;
  //    ✓          ✓                    ✓ 现在都满足了
  const anchorRect = anchorRef.current.getBoundingClientRect();
  const floatRect  = floatRef.current.getBoundingClientRect();
  setCoords({ left: 真实值, top: 真实值 });  // 触发第三次渲染
}, [visible, offset]);
```

**帧 4：用新坐标重渲染**
```tsx
coords = { left: 真实值, top: 真实值 }
// PositionedLayer 的 props 变了，DOM 位置被更新
// 此时用户看到 tooltip 正确出现在 icon 上方
```

---

### 为什么 Effect 里 ref 一定有值？

React 的提交阶段**严格按照**以下顺序：

```
1. 创建/更新 DOM 节点
2. 挨个赋值 ref（ref.current = 对应 DOM）
3. 运行 useLayoutEffect（同步）
4. 浏览器绘制
5. 运行 useEffect（异步）
```

所以到第 5 步 `useEffect` 执行时，ref 早就在第 2 步绑好了。这是 **React 的保证**，不是运气。

> [!warning] render 阶段不能读 ref
> ```tsx
> function Tooltip() {
>   const ref = useRef(null);
>   console.log(ref.current);  // ❌ null（首次渲染时）
>   return <div ref={ref} />;
> }
> ```
> ref 的赋值发生在 render 之后的 commit 阶段。**必须在 effect 里读 ref 才安全**。

---

## 首帧闪烁的控制

上面的时序分析暴露了一个代价：**tooltip 会在 (0, 0) 出现一帧再跳到正确位置**。用户肉眼可能看到一道闪光。以下是几种控制方案，从简单到完善。

---

### 方案 A：用 `useLayoutEffect` 代替 `useEffect`（最简单）

```tsx
function useAnchorPosition(anchorRef, floatRef, visible, offset) {
  const [coords, setCoords] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {  // ← 唯一改动
    if (!visible || !anchorRef.current || !floatRef.current) return;
    // ... 算坐标 ...
    setCoords({ left, top });
  }, [visible, offset]);

  return coords;
}
```

**原理：** `useLayoutEffect` **同步**在浏览器绘制**之前**跑。时序变成：

```
Commit DOM → useLayoutEffect 同步执行 → setCoords → 同步重渲染 → 浏览器绘制
                                                                ↑
                                                          用户看到的第一帧
                                                          已经是正确位置
```

用户**永远看不到** (0, 0) 的中间帧，因为那一帧没有被绘制。

**优点：** 改一行代码，效果完美。
**代价：** 同步阻塞渲染，如果计算量大会拖慢。对 tooltip 这种简单几何计算**完全没问题**，这是首选方案。

---

### 方案 B：`opacity: 0` 兜底（最保险）

```tsx
function useAnchorPosition(anchorRef, floatRef, visible, offset) {
  const [coords, setCoords] = useState({ left: 0, top: 0 });
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    if (!visible) { setReady(false); return; }
    if (!anchorRef.current || !floatRef.current) return;
    // ... 算坐标 ...
    setCoords({ left, top });
    setReady(true);
  }, [visible, offset]);

  return { coords, ready };
}

// 使用
const { coords, ready } = useAnchorPosition(...);

{visible && createPortal(
  <PositionedLayer
    ref={floatRef}
    left={coords.left}
    top={coords.top}
    style={{ opacity: ready ? 1 : 0 }}   // ← 未就位前隐形
  >
    <TooltipBox>{text}</TooltipBox>
  </PositionedLayer>,
  document.body
)}
```

**原理：** 即使 React 的时序出了意外（比如 SSR、浏览器调度器异常），`opacity: 0` 保证用户永远看不到未定位的 tooltip。

**优点：** 双保险；还可以配合 `transition: opacity 150ms` 做渐显动画。
**代价：** 多一个 `ready` state，多一次渲染。

---

### 方案 C：初始位置放到屏幕外（零状态方案）

```tsx
// 初始坐标不用 (0, 0)，而是远离屏幕
const [coords, setCoords] = useState({ left: -9999, top: -9999 });
```

**原理：** 第一帧即使被画出来也在屏幕外，用户看不到；Effect 算好真实坐标后再跳进视口。

**优点：** 不需要额外 state，最小改动。
**代价：** Tooltip 还是被渲染了，只是在屏幕外；有辅助设备（屏幕阅读器）可能会读到空的 tooltip。

---

### 方案 D：组合拳（生产级方案）

真正要上线的 tooltip 通常这样写：

```tsx
function useAnchorPosition(anchorRef, floatRef, visible, offset) {
  const [coords, setCoords] = useState({ left: 0, top: 0 });
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    if (!visible) {
      setReady(false);
      return;
    }
    if (!anchorRef.current || !floatRef.current) return;

    const anchorRect = anchorRef.current.getBoundingClientRect();
    const floatRect  = floatRef.current.getBoundingClientRect();
    const vw = window.innerWidth;

    let left = anchorRect.left + anchorRect.width / 2 - floatRect.width / 2;
    let top  = anchorRect.top  - floatRect.height - offset;
    if (left < 8) left = 8;
    if (left + floatRect.width > vw - 8) left = vw - floatRect.width - 8;
    if (top  < 8) top  = anchorRect.bottom + offset;

    setCoords({ left, top });
    setReady(true);
  }, [visible, offset]);

  return { coords, ready };
}

// PositionedLayer 用 transition 做渐显
const PositionedLayer = forwardRef<HTMLDivElement, Props>(
  function PositionedLayer({ left, top, ready, children }, ref) {
    return (
      <div
        ref={ref}
        style={{
          position: "fixed",
          left,
          top,
          zIndex: 9999,
          opacity: ready ? 1 : 0,
          transition: "opacity 120ms ease-out",
          pointerEvents: ready ? "auto" : "none",
        }}
      >
        {children}
      </div>
    );
  }
);
```

集齐了：
- `useLayoutEffect` → 同步测量，消灭闪烁的**根源**
- `ready` state → 定位未完成时 `opacity: 0` 兜底
- `transition` → 淡入动画，体验更柔和
- `pointerEvents: "none"` → 未就位时不响应鼠标事件

---

### 方案对比总览

| 方案                   | 改动量 | 能消除闪烁？ | 额外开销  | 推荐场景          |
| -------------------- | --- | ------ | ----- | ------------- |
| A: `useLayoutEffect` | 1 行 | ✅      | 同步阻塞  | 简单 tooltip，首选 |
| B: `opacity + ready` | 中   | ✅      | 多一次渲染 | 需要兜底保障        |
| C: 屏幕外初始化            | 最小  | ✅（视觉上） | 无障碍风险 | 快速临时方案        |
| D: 组合拳               | 较多  | ✅（带动画） | 最大    | 生产级组件库        |

> [!tip] 一句话总结
> 首帧闪烁的根源是 **异步 `useEffect` 发生在浏览器绘制之后**。最简单的修复是换成 **`useLayoutEffect`**——它同步跑在绘制之前，用户看到的第一帧就是正确位置。更完善的做法是叠加 `ready` state + `opacity` 兜底，再加一个淡入 transition 让交互更丝滑。

---

## 延伸：外层 `<span>` 为什么不像 `PositionedLayer` 一样抽出来？

一个自然的追问：既然 `PositionedLayer` 被从容器里抽成了展示组件，为什么绑鼠标事件的外层 `<span>` 不抽？这两层看起来都是「容器里的包裹 DOM」。

答案是：**可以改善，但不应该以「展示组件」的形式抽**，因为这两层的性质根本不同。

---

### 先看清两个包裹层的本质区别

| 维度 | `PositionedLayer`（已抽出） | 外层 `<span>`（未抽出） |
|------|----------------------------|------------------------|
| 主要职责 | **渲染**：把东西放到 fixed 坐标 | **交互**：监听鼠标事件 |
| 写不写样式？ | 写（`position: fixed, zIndex`） | 几乎不写（只有 `display: inline-flex`） |
| 依赖容器状态吗？ | 只读 coords（props） | **依赖 `setVisible`**（容器的 state setter） |
| 纯不纯？ | ✅ 纯——同样 props → 同样 DOM | ❌ 不纯——事件回调就是容器逻辑 |

**关键洞察：**
- `PositionedLayer` 是**纯展示**——接收坐标，渲染 fixed 盒子，不知道谁在调用它，也不回调任何东西
- 外层 `<span>` 的**核心价值就是「报告鼠标事件给容器」**，它的 `onMouseEnter` 直接调用 `setVisible`——这是**交互绑定**，不是展示

把它硬抽成展示组件 `<AnchorWrapper>`，会得到一个别扭的接口：

```tsx
// ❌ 展示组件里塞了两个回调，本质上是把事件原路返回
interface AnchorWrapperProps {
  onEnter: () => void;
  onLeave: () => void;
  className?: string;
  children: ReactNode;
}
```

这就是「展示组件不应该承担交互逻辑」的反例。**交互事件的源头在容器，就应该绑在容器写的 JSX 上。**

---

### 但这个 `<span>` 确实有代码异味

两点不干净：
1. **容器写了样式** `style={{ display: "inline-flex" }}` —— 虽然只有一行，但违反了硬边界
2. **容器直接操作 DOM**（`ref` + 事件监听器散落在 JSX 里） —— 显得啰嗦

下面是三种逐级递进的改善方案。

---

### 方案 A：抽出 Hook（最轻量）

核心思路：**逻辑（事件 + ref + state）打包进 hook，`<span>` 本身留在容器里**。

```tsx
function useHoverAnchor<T extends HTMLElement>() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<T>(null);

  // 返回「可以直接 spread 到元素上」的 props 对象
  const anchorProps = {
    ref,
    onMouseEnter: () => setVisible(true),
    onMouseLeave: () => setVisible(false),
  };

  return { visible, anchorRef: ref, anchorProps };
}

// 容器
export function Tooltip({ text, children, offset = 8, className }: TooltipProps) {
  const { visible, anchorRef, anchorProps } = useHoverAnchor<HTMLSpanElement>();
  const floatRef = useRef<HTMLDivElement>(null);
  const coords = useAnchorPosition(anchorRef, floatRef, visible, offset);

  return (
    <>
      <span {...anchorProps} className={className} style={{ display: "inline-flex" }}>
        {children}
      </span>
      {visible && createPortal(/* ... */, document.body)}
    </>
  );
}
```

**评价：**
- ✅ 交互逻辑从容器 JSX 里消失
- ✅ 可复用——Popover、Dropdown 都能用同一个 hook
- ❌ `<span>` 和 `display: inline-flex` 还在容器里
- ❌ 仍然多包了一层 DOM

---

### 方案 B：Render Prop（让调用方自己做 anchor）

核心思路：**干脆不包 `<span>`，把 anchor 的 props 交给调用方去 spread 到他自己的元素上**。

```tsx
interface TooltipProps {
  text: ReactNode;
  children: (triggerProps: {
    ref: RefObject<HTMLElement>;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  }) => ReactNode;
  offset?: number;
}

export function Tooltip({ text, children, offset = 8 }: TooltipProps) {
  const { visible, anchorRef, anchorProps } = useHoverAnchor<HTMLElement>();
  const floatRef = useRef<HTMLDivElement>(null);
  const coords = useAnchorPosition(anchorRef, floatRef, visible, offset);

  return (
    <>
      {children(anchorProps)}   {/* ← 调用方自己用 */}
      {visible && createPortal(/* ... */, document.body)}
    </>
  );
}

// 用法
<Tooltip text="说明">
  {(triggerProps) => (
    <QuestionIcon {...triggerProps} size={16} />
    // ↑ 问号图标本身就是 anchor，没有多余的 span 包裹
  )}
</Tooltip>
```

**评价：**
- ✅ **DOM 完全扁平**——没有多余的 `<span>` 包裹层
- ✅ `display: inline-flex` 不再存在——trigger 本身是什么 display 就是什么
- ❌ API 变成函数形式，调用方稍微多写一点
- ❌ 如果 trigger 是 `QuestionIcon` 这种展示组件，必须支持 `forwardRef` 并透传 `onMouseEnter/Leave`

---

### 方案 C：`asChild` / Slot 模式（Radix UI 同款，最优雅）

核心思路：**`children` 只接受一个 React 元素，`Tooltip` 用 `cloneElement` 把 anchor props 注入到它身上**。

```tsx
import { cloneElement, isValidElement, Children } from "react";

export function Tooltip({ text, children, offset = 8 }: TooltipProps) {
  const { visible, anchorRef, anchorProps } = useHoverAnchor<HTMLElement>();
  const floatRef = useRef<HTMLDivElement>(null);
  const coords = useAnchorPosition(anchorRef, floatRef, visible, offset);

  const child = Children.only(children);
  if (!isValidElement(child)) {
    throw new Error("Tooltip 需要一个单一 React 元素作为 children");
  }

  // 把 anchor 的 props 合并到 child 身上
  const trigger = cloneElement(child, {
    ...anchorProps,
    onMouseEnter: (e: React.MouseEvent) => {
      anchorProps.onMouseEnter();
      (child.props as any).onMouseEnter?.(e);   // 链式调用原回调
    },
    onMouseLeave: (e: React.MouseEvent) => {
      anchorProps.onMouseLeave();
      (child.props as any).onMouseLeave?.(e);
    },
  });

  return (
    <>
      {trigger}
      {visible && createPortal(/* ... */, document.body)}
    </>
  );
}

// 用法——最简洁，API 和之前完全一样
<Tooltip text="说明">
  <QuestionIcon size={16} />
</Tooltip>
```

**评价：**
- ✅ **调用方 API 极度干净**——和原来一样，但 DOM 里没有任何多余包裹层
- ✅ 原生 HTML 元素也能直接用：`<Tooltip text="..."><button>...</button></Tooltip>`
- ✅ 这是 Radix UI、Headless UI、shadcn/ui 等主流库的标准做法
- ❌ 实现复杂：要处理 `cloneElement`、事件链合并、ref 合并（child 自己也有 ref 时）
- ❌ child 必须是能接收 ref 和事件的组件（不能是纯文本）

---

### 三种方案对比

| 方案 | DOM 扁平 | 调用方 API | 实现复杂度 | 对 child 的要求 |
|------|---------|-----------|----------|---------------|
| 当前设计 | ❌ 有 `<span>` 包裹 | 简单 | 最简单 | 无要求 |
| A: `useHoverAnchor` Hook | ❌ 仍有 `<span>` | 简单 | 低 | 无要求 |
| B: Render Prop | ✅ 扁平 | 函数形式 | 中 | 必须支持 ref 和事件 |
| C: Slot / `asChild` | ✅ 扁平 | 最简洁 | 高 | 必须支持 ref 和事件 |

---

### 推荐路径

- **日常场景 → 方案 A（`useHoverAnchor` Hook）**  
  把交互逻辑搬进 hook，改动小，复用性强，适合业务组件。

- **追求 DOM 扁平 / 写组件库 → 方案 C（`asChild` Slot 模式）**  
  Radix 同款，调用方 API 最优雅，是生产级组件库的标准做法。

---

> [!tip] 深层原理
> **「展示组件」对应「纯渲染」，不对应「所有非业务的 DOM 包裹层」**。外层 `<span>` 虽然是包裹层，但它持有交互回调，属于容器组件的表达形式。想让容器更纯净，应该走 **Hook 提取交互 + Slot 模式消灭包裹 DOM** 两条路线，而不是强行套「提取为展示组件」。

---

## 延伸：Radix UI Tooltip 的完整架构

Radix UI 是生产级组件库，它的 Tooltip 和我们手写的思路相同（Content 不持有坐标），但在几个关键机制上做了更完善的设计。

---

### 组件树结构

```tsx
<Tooltip.Provider>        {/* 全局延迟配置 */}
  <Tooltip.Root>          {/* 持有 open 状态 */}
    <Tooltip.Trigger asChild>
      <button>Hover me</button>
    </Tooltip.Trigger>

    <Tooltip.Portal>      {/* createPortal */}
      <Tooltip.Content>   {/* 展示层，不知道坐标 */}
        提示文字
        <Tooltip.Arrow />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
```

| 组件 | 职责 |
|------|------|
| `Provider` | 全局配置：悬浮延迟、跨 Tooltip 快速切换时跳过延迟 |
| `Root` | **持有 `open` 状态**；创建 Context 向下广播 |
| `Trigger` | 绑定鼠标事件；用 `asChild` 把 props 注入 child |
| `Portal` | `createPortal` 到 `document.body` |
| `Content` | 纯展示层；从 Context 读 `open`；**自己不持有坐标** |

---

### 关键差异一：`open` 状态靠 Context 广播，不是 props 传递

我们的实现是单组件——状态在 `Tooltip` 容器里，显式控制子层渲染：

```tsx
// 我们的方式
function Tooltip() {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <span onMouseEnter={() => setVisible(true)}>{children}</span>
      {visible && <PositionedLayer>...</PositionedLayer>}
    </>
  );
}
```

Radix 是多组件协作——`Root` 持有状态，各部件通过 Context 自取：

```tsx
// Radix 的方式（简化伪代码）
const TooltipContext = createContext();

function Root({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      {children}
    </TooltipContext.Provider>
  );
}

function Trigger({ asChild, children }) {
  const { setOpen } = useContext(TooltipContext);  // 从 Context 取 setter
  // ... 注入到 child
}

function Content({ children }) {
  const { open } = useContext(TooltipContext);     // 从 Context 读 open
  if (!open) return null;
  return <div>{children}</div>;
}
```

好处是：`Trigger` 和 `Content` 在 JSX 树里可以任意嵌套，只要都在 `Root` 里面，状态自动流通，无需手动连线。

---

### 关键差异二：坐标计算用 Floating UI，不是手动 `getBoundingClientRect`

这是最大的架构差异。

**我们的方式：**
```
render(visible=true, coords={0,0})
  → DOM 插入
  → useEffect 跑 getBoundingClientRect()
  → setCoords(真实值)
  → 第二次 render（首帧闪烁问题）
```

**Radix 的方式：** 内部使用 `@floating-ui/react-dom`

```tsx
// Radix Popper 内部（简化）
import { useFloating, autoUpdate, flip, shift } from '@floating-ui/react-dom';

function PopperContent({ side, sideOffset, children }) {
  const { refs, floatingStyles } = useFloating({
    placement: side,
    middleware: [flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,  // 自动跟踪 anchor 位置
  });

  return (
    <div ref={refs.setFloating} style={floatingStyles}>
      {children}
    </div>
  );
}
```

`useFloating` 返回的 `floatingStyles` 是：

```js
{
  position: 'fixed',
  top: 0,
  left: 0,
  transform: 'translate(240px, 180px)'  // 用 transform 定位，而非 top/left
}
```

> [!note] 为什么用 `transform` 而不是 `top / left`？
> `transform: translate(x, y)` 触发 GPU 合成层，不引起 reflow，性能更好。
> 而 `top: x; left: y` 每次修改都需要重新布局（reflow）。

`autoUpdate` 会用 `ResizeObserver` + `scroll` 事件持续追踪 anchor 位置，窗口滚动或元素尺寸变化时 tooltip 自动跟随——我们的实现做不到这点。

---

### 关键差异三：`Content` 完全不知道坐标

Radix 的层次是：

```
Tooltip.Content（用户写的展示层）
  └── PopperContent（内部定位包裹层，对用户透明）
        └── 应用 floatingStyles 的 <div>（transform 定位）
              └── Content 的 children（文字、Arrow 等）
```

用户写的 `<Tooltip.Content>` 接受的 props 是：

```tsx
<Tooltip.Content
  side="top"       // 偏好方向（不是坐标）
  sideOffset={8}   // 偏移量（不是坐标）
  className="..."  // 样式类
>
```

没有 `left`、`top`、`coords` 这类东西。坐标完全在内部的 `PopperContent` 里消化掉，`Content` 只声明「我想在哪个方向出现」，具体数值由 Floating UI 算。**这和我们把坐标封进 `PositionedLayer` 的思路完全一致**，只是 Radix 做得更彻底、对用户更透明。

---

### 关键差异四：`Trigger` 用 `asChild`（即方案 C）

```tsx
<Tooltip.Trigger asChild>
  <button>Hover me</button>   {/* DOM 里没有多余包裹层 */}
</Tooltip.Trigger>
```

Radix 内部的 `Primitive` 组件实现了 `cloneElement` + Slot 逻辑：

```tsx
// Radix Primitive 简化伪代码
function Primitive({ asChild, children, ...props }) {
  if (asChild && isValidElement(children)) {
    return cloneElement(children, mergeProps(props, children.props));
  }
  return <button {...props}>{children}</button>;  // 默认渲染 button
}
```

触发元素本身就是 anchor，DOM 里不多出任何包裹层。

---

### 完整数据流对比

```
我们的实现
────────────────────────────────────────────
Tooltip 容器
  ├── visible state ──→ 条件渲染 PositionedLayer
  ├── useLayoutEffect → getBoundingClientRect() → coords
  └── coords ──→ PositionedLayer 的 left / top props

Radix 的实现
────────────────────────────────────────────
Root（Context Provider）
  ├── open state ──→ Context
  │                    ├── Trigger 读取（绑事件）
  │                    └── Content 读取（决定是否渲染）
  └── triggerRef ──→ Context → PopperContent → @floating-ui

Trigger（asChild cloneElement）
  └── 把 onMouseEnter/Leave 注入 child，无包裹 DOM

Content（读 open from Context）
  └── PopperContent（内部，用户不可见）
        └── useFloating(triggerRef) → floatingStyles（transform）
              └── 应用到内部 wrapper div
```

---

### 架构选择对比总览

| 问题             | 我们的方案                      | Radix 的方案                    | Radix 的理由                      |
| -------------- | -------------------------- | ---------------------------- | ------------------------------ |
| 状态共享           | 容器持有，显式传递                  | Context 广播                   | 子组件可任意嵌套，无需手动连线                |
| 坐标计算           | 手动 `getBoundingClientRect` | `@floating-ui` `useFloating` | 自动跟踪 + 无首帧闪烁 + flip/shift 开箱即用 |
| 定位方式           | `left / top`               | `transform: translate`       | 不触发 reflow，性能更好                |
| Trigger DOM    | 外层 `<span>` 包裹             | `asChild` cloneElement       | DOM 扁平                         |
| Content 知道坐标吗？ | ❌（封在 `PositionedLayer`）    | ❌（封在内部 `PopperContent`）      | 两者思路相同，都把坐标隔离在展示层之外            |
|                |                            |                              |                                |

---

## 相关概念

- [[React Portal]]
- [[getBoundingClientRect]]
- [[组件拆分 - 容器组件与展示组件]]
