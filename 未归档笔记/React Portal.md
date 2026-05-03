---
tags:
  - react
  - 前端
  - dom
  - portal
created: 2026-04-24
---

# React Portal

## 概述

**React Portal** 是 React 提供的一种机制，允许你将子组件渲染到**父组件 DOM 树之外**的任意 DOM 节点中。

```tsx
import { createPortal } from 'react-dom';

createPortal(children, domNode, key?)
```

| 参数         | 类型          | 说明                            |
| ---------- | ----------- | ----------------------------- |
| `children` | `ReactNode` | 要渲染的 React 内容（JSX、组件、字符串等）    |
| `domNode`  | `Element`   | 目标挂载 DOM 节点，如 `document.body` |
| `key`      | `string?`   | 可选，用于列表 reconciliation        |

---

## 为什么需要 Portal？

默认情况下，React 组件渲染的 DOM 节点会**严格嵌套**在父组件的 DOM 结构中。这在大多数场景下没问题，但当父级存在以下 CSS 属性时，子元素会受到约束：

| CSS 属性               | 对子元素的影响                                |
| -------------------- | -------------------------------------- |
| `overflow: hidden`   | 超出父级边界的内容被裁剪                           |
| `z-index`            | 子元素的层叠上下文被限制在父级内                       |
| `transform`          | 创建新的 Stacking Context，影响 `fixed` 定位子元素 |
| `position: relative` | 影响 `position: absolute` 子元素的参照基准       |

**Portal 解决方案**：把需要「逃脱」这些约束的内容渲染到 `document.body`（或其他顶层节点），从 CSS 层面彻底脱离父级的限制。

```
应用 DOM 树                      真实 DOM 树
──────────────────────           ──────────────────────
<App>                            <body>
  <Card>                           <div id="root">  ← React 通常挂载点
    <Tooltip>          ──渲染到──>    <App>
      (Portal content)                 <Card />     ← Tooltip 的 icon
    </Tooltip>                     </div>
  </Card>                          <div>            ← Portal 实际渲染位置
</App>                               (Tooltip 内容)
                                 </div>
                               </body>
```

> [!important] 关键特性
> Portal 只是改变了 **DOM 位置**，**React 组件树的逻辑层级不变**。Portal 内的组件仍然是父组件的子组件，Context、state、事件冒泡等行为都按 React 树（而非 DOM 树）来工作。

---

## 核心 API 用法

### 基础示例

```tsx
import { useState } from 'react';
import { createPortal } from 'react-dom';

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return createPortal(
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 8,
        padding: 24, minWidth: 320,
      }}>
        {children}
        <button onClick={onClose}>关闭</button>
      </div>
    </div>,
    document.body   // 挂载到 body，脱离任何父级约束
  );
}

function App() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ overflow: 'hidden' }}>  {/* 有 overflow: hidden 也没关系 */}
      <button onClick={() => setOpen(true)}>打开 Modal</button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <p>我是一个 Portal Modal！</p>
        </Modal>
      )}
    </div>
  );
}
```

### 挂载到自定义容器节点

比起直接挂到 `document.body`，更推荐提前在 HTML 中准备专用容器节点：

```html
<!-- index.html -->
<body>
  <div id="root"></div>
  <div id="modal-root"></div>    <!-- Modal 专用 -->
  <div id="toast-root"></div>    <!-- Toast 通知专用 -->
</body>
```

```tsx
// 使用专用容器
const modalRoot = document.getElementById('modal-root')!;

createPortal(<MyModal />, modalRoot);
```

> [!tip] 好处
> 各类型 UI 有独立的挂载点，更易于 DevTools 调试，也便于统一设置 `z-index` 层级策略。

---

## 常见使用场景

### 1. Modal / Dialog 对话框

最经典的 Portal 使用场景。对话框需要覆盖整个页面，不能被任何父级 `overflow` 或 `z-index` 裁剪。

```tsx
function Dialog({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return createPortal(
    <>
      {/* 遮罩层 */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999 }}
        onClick={onClose}
      />
      {/* 对话框主体 */}
      <div role="dialog" aria-modal="true" style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: '#fff', borderRadius: 12,
        padding: '24px 32px', zIndex: 1000,
        minWidth: 400,
      }}>
        <h2>{title}</h2>
        {children}
      </div>
    </>,
    document.body
  );
}
```

---

### 2. Tooltip / Popover

悬浮提示框需要显示在触发元素附近，但触发元素可能深埋在 `overflow: hidden` 的容器内。

> 参见 [[Tooltip 组件拆分设计]] 中的完整实现，使用了 `createPortal` 配合 [[getBoundingClientRect]] 实现精确定位。

```tsx
{visible && createPortal(
  <div style={{ position: 'fixed', left: coords.left, top: coords.top, zIndex: 9999 }}>
    <TooltipBox>{text}</TooltipBox>
  </div>,
  document.body
)}
```

---

### 3. Toast / Notification 通知

全局通知不属于任何特定组件，适合挂载到专用容器统一管理。

```tsx
// toast-container.tsx
const toastRoot = document.getElementById('toast-root')!;

function ToastContainer({ toasts }) {
  return createPortal(
    <div style={{
      position: 'fixed', top: 16, right: 16,
      display: 'flex', flexDirection: 'column', gap: 8,
      zIndex: 9999,
    }}>
      {toasts.map(t => <Toast key={t.id} {...t} />)}
    </div>,
    toastRoot
  );
}
```

---

### 4. Dropdown / Select 下拉菜单

下拉菜单需要突破表格单元格、`overflow: hidden` 的卡片等容器约束。

```tsx
function Dropdown({ anchor, children, isOpen }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen && anchor.current) {
      const rect = anchor.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <ul style={{
      position: 'fixed', top: pos.top, left: pos.left,
      background: '#fff', border: '1px solid #e5e7eb',
      borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      zIndex: 1000, listStyle: 'none', margin: 0, padding: '4px 0',
      minWidth: 160,
    }}>
      {children}
    </ul>,
    document.body
  );
}
```

---

### 5. 侧边抽屉（Drawer）

```tsx
function Drawer({ isOpen, onClose, children }) {
  return createPortal(
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 998 }}
        onClick={onClose}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0,
        width: 400, height: '100vh',
        background: '#fff', zIndex: 999,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease',
        padding: 24, overflowY: 'auto',
      }}>
        {children}
      </div>
    </>,
    document.body
  );
}
```

---

## 事件冒泡行为

> [!important] 按 React 树冒泡，而非 DOM 树
> Portal 内触发的事件，会沿着 **React 组件树**向上冒泡，而不是沿 DOM 树冒泡。

```tsx
function App() {
  // 即使 Modal 的 DOM 节点在 document.body 下
  // 这里的 onClick 依然会被 Modal 内部的点击事件冒泡触发
  return (
    <div onClick={() => console.log('App clicked!')}>
      <Modal>
        <button onClick={() => console.log('Button clicked!')}>
          点击我
        </button>
      </Modal>
    </div>
  );
}
// 点击按钮时，控制台输出：
// Button clicked!
// App clicked!      ← 沿 React 树冒泡到了 App
```

这个特性非常重要：你可以在父组件统一捕获 Portal 内容发出的事件，无需额外的通信层。

> [!warning] 阻止冒泡时注意层级
> 如果你在遮罩层 `onClick` 中调用 `e.stopPropagation()`，阻止的是 **React 树**上的冒泡，不是 DOM 树上的。要特别注意嵌套 Portal 的场景。

---

## 最佳实践

### ✅ 1. 使用专用挂载容器，而非直接挂到 `document.body`

```html
<!-- ✅ 在 index.html 中预置容器 -->
<div id="overlay-root"></div>

<!-- ❌ 直接挂 body，所有 Portal 混在一起，难以调试 -->
```

```tsx
// 常见做法：封装 hook 动态创建容器
function usePortalTarget(id: string) {
  const [target] = useState(() => {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    return el;
  });
  return target;
}

// 用法
const target = usePortalTarget('modal-root');
return createPortal(<Modal />, target);
```

---

### ✅ 2. 配合 `useEffect` 做副作用管理（阻止 body 滚动）

Modal 打开时，常需要锁定页面滚动：

```tsx
function Modal({ isOpen, onClose, children }) {
  useEffect(() => {
    if (!isOpen) return;

    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';  // 禁止滚动

    return () => {
      document.body.style.overflow = original; // 关闭时恢复
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(<div className="modal">{children}</div>, document.body);
}
```

---

### ✅ 3. 键盘无障碍（Accessibility）

Modal 等覆盖层必须处理键盘焦点管理：

```tsx
function AccessibleModal({ isOpen, onClose, children }) {
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      // 打开时自动聚焦到 Modal 内的第一个可交互元素
      firstFocusRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(); // ESC 关闭
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div role="dialog" aria-modal="true">
      {children}
      <button ref={firstFocusRef} onClick={onClose}>关闭</button>
    </div>,
    document.body
  );
}
```

---

### ✅ 4. 用条件渲染控制挂载，而非只控制显示

```tsx
// ❌ 总是挂载，只靠 CSS 控制显示——Portal 的 DOM 节点常驻，浪费资源
{createPortal(
  <div style={{ display: isOpen ? 'block' : 'none' }}>...</div>,
  document.body
)}

// ✅ 条件挂载——不需要时完全从 DOM 移除
{isOpen && createPortal(
  <div>...</div>,
  document.body
)}
```

---

### ✅ 5. z-index 分层管理

用 CSS 变量或常量集中管理层叠顺序，避免各处写魔法数字：

```css
/* global.css */
:root {
  --z-dropdown:    1000;
  --z-tooltip:     1100;
  --z-modal:       1200;
  --z-toast:       1300;
}
```

```tsx
<div style={{ zIndex: 'var(--z-modal)' }}>...</div>
```

---

## 常见陷阱

> [!warning] 陷阱 1：`document.body` 上的 `onClick` 被意外触发
> 由于 Portal 按 React 树冒泡，挂在祖先组件上的事件监听器可能意外接收到 Portal 内的事件。
> **解决**：在弹层外层 `div` 上加 `e.stopPropagation()`，或重新设计事件处理逻辑。

> [!warning] 陷阱 2：SSR（服务端渲染）时 `document` 不存在
> `createPortal` 依赖 `document`，在 Node.js 环境中直接调用会报错。
>
> ```tsx
> // ✅ 用 useEffect 或 typeof 检查
> const [mounted, setMounted] = useState(false);
> useEffect(() => setMounted(true), []);
>
> if (!mounted) return null;
> return createPortal(<Modal />, document.body);
> ```

> [!warning] 陷阱 3：忘记清理动态创建的容器节点
> 如果用代码动态 `appendChild` 了容器节点，组件卸载时要记得移除，否则会泄露 DOM 节点。

---

## 与第三方库的关系

主流 UI 库底层都用了 Portal（或等价实现）：

| 库               | Portal 用途                                              |
| --------------- | ------------------------------------------------------ |
| **Ant Design**  | `Modal`、`Drawer`、`Tooltip`、`Select` 等                  |
| **Material UI** | `Modal`、`Popper`、`Snackbar` 等                          |
| **Headless UI** | `Dialog`、`Popover`、`Combobox`                          |
| **Radix UI**    | `Dialog.Portal`、`Popover.Portal`、`DropdownMenu.Portal` |

---

## 快速参考

```tsx
import { createPortal } from 'react-dom';

// 基础用法
createPortal(<MyComponent />, document.body)

// 挂载到指定节点
createPortal(<Toast />, document.getElementById('toast-root')!)

// 条件渲染（推荐）
{isOpen && createPortal(<Modal />, document.body)}

// 带 key（列表场景）
createPortal(<Item />, container, 'unique-key')
```

---

## 相关概念

- [[Tooltip 组件拆分设计]]
- [[getBoundingClientRect]]
- [[组件拆分 - 容器组件与展示组件]]
