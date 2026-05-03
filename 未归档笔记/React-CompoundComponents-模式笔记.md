# Compound Components 模式:用"组装零件"的方式设计 React 组件

> 当组件需要多个插槽、且子组件需要访问父组件内部状态时,Compound Components(复合组件)模式是比 render props 更优雅的选择。本笔记从一个 Tooltip 的演进出发,讲清这种模式的实现机制、本质,以及它在 IoC 框架下的位置。

---

## 一、目标 API:像 HTML 一样组装

我们想要的调用方式:

```tsx
<Tooltip>
  <Tooltip.Trigger>
    <QuestionIcon />
  </Tooltip.Trigger>
  <Tooltip.Content>
    <p>这里是详情</p>
    <button>点我</button>
  </Tooltip.Content>
</Tooltip>
```

这种 API 的好处:

- **语义清晰**:一眼看出哪部分是触发区、哪部分是浮层
- **多插槽自然**:不用 render props 的"函数包一层",直接像写 HTML 一样嵌套
- **像原生 HTML**:类似 `<select><option></option></select>` 那种父子配合关系
- **可扩展**:以后想加 `<Tooltip.Arrow>`、`<Tooltip.Header>` 都很自然

社区里的 **Radix UI**、**Headless UI**、**Ant Design** 大量使用这种模式。

---

## 二、核心难题:子组件怎么和父组件通信?

把 Tooltip 拆成 `<Tooltip.Trigger>` 和 `<Tooltip.Content>` 两个独立组件后,会遇到一个关键问题:

```tsx
<Tooltip>
  <Tooltip.Trigger>      {/* 我怎么拿到 setVisible 来 hover 控制? */}
    <QuestionIcon />
  </Tooltip.Trigger>
  <Tooltip.Content>      {/* 我怎么拿到 coords 和 visible 来定位? */}
    <p>...</p>
  </Tooltip.Content>
</Tooltip>
```

子组件之间是**兄弟关系**,不是父子关系。父组件 `Tooltip` 内部维护着:

- `visible` 状态
- `anchorRef` / `floatRef` 引用
- `coords` 坐标
- `setVisible` 等方法

纯靠 props 一层层传下去会非常笨拙(还要让用户手动传 ref?)。

### 解法:React Context

用 Context 在 `Tooltip` 内部建立一个"私有总线":

- 父组件把状态放进去
- 子组件从里面读

这就是 Compound Components 模式的核心机制。

---

## 三、完整实现(分步)

### 第 1 步:定义 Context

```tsx
import { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';

type TooltipContextValue = {
  visible: boolean;
  setVisible: (v: boolean) => void;
  anchorRef: React.RefObject<HTMLSpanElement | null>;
  floatRef: React.RefObject<HTMLDivElement | null>;
  coords: { left: number; top: number };
  offset: number;
};

const TooltipContext = createContext<TooltipContextValue | null>(null);

// 工具函数:确保子组件必须用在 <Tooltip> 里面
function useTooltipContext() {
  const ctx = useContext(TooltipContext);
  if (!ctx) {
    throw new Error('Tooltip.Trigger / Tooltip.Content 必须在 <Tooltip> 内部使用');
  }
  return ctx;
}
```

`useTooltipContext` 是惯用做法——如果有人不小心在 `<Tooltip>` 外面用了 `<Tooltip.Trigger>`,直接抛错,比 `null` 引用错误更友好。

### 第 2 步:父组件 Tooltip(协调者)

```tsx
type TooltipProps = {
  children: ReactNode;
  offset?: number;
};

export function Tooltip({ children, offset = 8 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const coords = useAnchorPosition(anchorRef, floatRef, visible, offset);

  return (
    <TooltipContext.Provider 
      value={{ visible, setVisible, anchorRef, floatRef, coords, offset }}
    >
      {children}
    </TooltipContext.Provider>
  );
}
```

关键变化:

- **不再渲染具体 DOM**——父组件只是个"协调者",DOM 由子组件自己渲染
- **不再有 `text` prop**——这个职责交给 `<Tooltip.Content>`
- **核心职责**:持有状态,通过 Context 共享给子组件

### 第 3 步:Tooltip.Trigger(触发区)

```tsx
type TriggerProps = {
  children: ReactNode;
  className?: string;
};

function Trigger({ children, className }: TriggerProps) {
  const { setVisible, anchorRef } = useTooltipContext();

  return (
    <span
      ref={anchorRef}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      className={className}
      style={{ display: 'inline-flex' }}
    >
      {children}
    </span>
  );
}
```

逻辑和原始 Tooltip 中那个 `<span ref={anchorRef}>...</span>` 一模一样,只是从父组件挪进来,通过 context 拿到 `setVisible` 和 `anchorRef`。

### 第 4 步:Tooltip.Content(浮层)

```tsx
type ContentProps = {
  children: ReactNode;
};

function Content({ children }: ContentProps) {
  const { visible, floatRef, coords } = useTooltipContext();

  if (!visible) return null;

  return createPortal(
    <PositionedLayer ref={floatRef} left={coords.left} top={coords.top}>
      <TooltipBox>{children}</TooltipBox>
    </PositionedLayer>,
    document.body
  );
}
```

也是从原代码里把"浮层那一坨"挪过来,通过 context 拿到 `visible`、`floatRef`、`coords`。

### 第 5 步:把子组件挂到父组件上

```tsx
Tooltip.Trigger = Trigger;
Tooltip.Content = Content;
```

这一行是 Compound Components 模式的"魔法"——它让 `Tooltip.Trigger` 这种点访问语法生效。

**本质**:JavaScript 函数本来就是对象,可以在上面挂任意属性。`Tooltip` 是函数,给它加 `.Trigger` 字段就是给对象加属性,再正常不过。

### 完整代码

```tsx
import { createContext, useContext, useState, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';

// ===== Context =====
type TooltipContextValue = {
  visible: boolean;
  setVisible: (v: boolean) => void;
  anchorRef: React.RefObject<HTMLSpanElement | null>;
  floatRef: React.RefObject<HTMLDivElement | null>;
  coords: { left: number; top: number };
  offset: number;
};

const TooltipContext = createContext<TooltipContextValue | null>(null);

function useTooltipContext() {
  const ctx = useContext(TooltipContext);
  if (!ctx) throw new Error('Tooltip.* 必须在 <Tooltip> 内部使用');
  return ctx;
}

// ===== 父组件 =====
type TooltipProps = {
  children: ReactNode;
  offset?: number;
};

export function Tooltip({ children, offset = 8 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const coords = useAnchorPosition(anchorRef, floatRef, visible, offset);

  return (
    <TooltipContext.Provider 
      value={{ visible, setVisible, anchorRef, floatRef, coords, offset }}
    >
      {children}
    </TooltipContext.Provider>
  );
}

// ===== 子组件 =====
function Trigger({ children, className }: { children: ReactNode; className?: string }) {
  const { setVisible, anchorRef } = useTooltipContext();
  return (
    <span
      ref={anchorRef}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      className={className}
      style={{ display: 'inline-flex' }}
    >
      {children}
    </span>
  );
}

function Content({ children }: { children: ReactNode }) {
  const { visible, floatRef, coords } = useTooltipContext();
  if (!visible) return null;
  return createPortal(
    <PositionedLayer ref={floatRef} left={coords.left} top={coords.top}>
      <TooltipBox>{children}</TooltipBox>
    </PositionedLayer>,
    document.body
  );
}

// ===== 挂载子组件 =====
Tooltip.Trigger = Trigger;
Tooltip.Content = Content;
```

调用:

```tsx
<Tooltip offset={12}>
  <Tooltip.Trigger>
    <QuestionIcon />
  </Tooltip.Trigger>
  <Tooltip.Content>
    <p>这里可以放任意内容</p>
    <button>甚至按钮</button>
  </Tooltip.Content>
</Tooltip>
```

---

## 四、Compound Components 的两种风格

### 4.1 点访问语法(命名空间风格)

```tsx
Tooltip.Trigger = Trigger;
Tooltip.Content = Content;
```

调用:

```tsx
import { Tooltip } from './Tooltip';

<Tooltip>
  <Tooltip.Trigger>...</Tooltip.Trigger>
  <Tooltip.Content>...</Tooltip.Content>
</Tooltip>
```

| 优点 | 缺点 |
|---|---|
| 命名空间清晰 | TypeScript 类型推断需要技巧 |
| 导入方便(一行搞定) | Tree-shaking 不如独立导出 |
| IDE 自动补全友好 | |

代表库:**Headless UI**、**Mantine**

### 4.2 独立导出版

```tsx
export { Tooltip, Trigger as TooltipTrigger, Content as TooltipContent };
```

调用:

```tsx
import { Tooltip, TooltipTrigger, TooltipContent } from './Tooltip';

<Tooltip>
  <TooltipTrigger>...</TooltipTrigger>
  <TooltipContent>...</TooltipContent>
</Tooltip>
```

| 优点 | 缺点 |
|---|---|
| 类型更直白 | 命名空间分散 |
| Tree-shaking 更友好 | 导入语句变长 |

代表库:**Radix UI**

两种都常见,看团队偏好。

---

## 五、TypeScript 的小坑

直接写下面的代码,TypeScript 可能推断不出 `Tooltip.Trigger` 的类型:

```tsx
export function Tooltip({ ... }: TooltipProps) { ... }
Tooltip.Trigger = Trigger;  // TS 可能不认这个
```

### 解法 1:显式类型 + 类型断言

```tsx
type TooltipComponent = {
  (props: TooltipProps): JSX.Element;
  Trigger: typeof Trigger;
  Content: typeof Content;
};

export const Tooltip: TooltipComponent = (({ children, offset = 8 }: TooltipProps) => {
  // ... 实现
}) as TooltipComponent;

Tooltip.Trigger = Trigger;
Tooltip.Content = Content;
```

### 解法 2:Object.assign(推荐)

```tsx
function TooltipBase({ ... }: TooltipProps) { ... }

export const Tooltip = Object.assign(TooltipBase, {
  Trigger,
  Content,
});
```

第二种更简洁,**推荐使用**。

---

## 六、Compound Components 的本质:Context 注入式 IoC

把今天讨论的几种模式放在 IoC 框架下对比:

| 模式 | 怎么给子组件传内部状态 | 注入媒介 |
|---|---|---|
| **普通 props** | 父组件直接传 | prop 值 |
| **render prop** | 把状态作为函数参数传给调用方写的函数 | 函数参数 |
| **Compound Components** | 把状态放进 Context,子组件自己取 | React Context |

三种模式都是 IoC,只是**注入媒介不同**。

### render prop vs Compound Components

| 维度 | render prop | Compound Components |
|---|---|---|
| 调用语法 | `<Tooltip popup={({ close }) => ...} />` | `<Tooltip><Tooltip.Trigger/><Tooltip.Content/></Tooltip>` |
| 状态传递机制 | 函数参数 | React Context |
| 心智模型 | "调用方写一个回调" | "调用方组装零件" |
| 视觉风格 | JS 函数感强 | HTML 标签感强 |
| 多插槽 | 需要多个 render prop | 天然支持 |
| 学习曲线 | 中等(需要懂闭包/函数) | 低(像写 HTML) |

---

## 七、什么时候选哪种?

| 场景 | 推荐模式 |
|---|---|
| 多插槽、零件可灵活组合 | **Compound Components** |
| 子组件需要响应父组件状态(如 Tabs 切换) | **Compound Components** |
| 想要"像 HTML 一样"的 API | **Compound Components** |
| 单个插槽,只是需要注入状态 | **render prop** |
| 想要在调用方做大量定制逻辑 | **render prop** |
| API 简单,不想引入 Context | **render prop** |
| 父子组件无需共享状态 | **普通 props/children** |

实际项目里,这几种模式经常**混合使用**——比如 Radix 的 `<Dialog>` 是 compound 模式,但 `<Dialog.Close asChild>` 又用了类似 render prop 的风格。

---

## 八、Compound Components 的代价

| 代价 | 体现 |
|---|---|
| **隐式依赖关系** | 子组件必须在父组件内才能用,但代码上看不出来 |
| **Context 重渲染** | Context 值变化会触发所有消费者重渲染,需要谨慎 |
| **顺序敏感性** | 某些情况下子组件的渲染顺序会影响行为 |
| **TS 类型复杂** | 比普通组件多一层类型工程 |
| **学习成本** | 调用方需要理解"哪些子组件可用、能放在哪里" |

设计这种 API 时,**清晰的运行时报错**(比如 `useTooltipContext` 抛错)比静态类型更重要——因为很多约束(如"必须在 Provider 内")是运行时关系,TS 难以完整覆盖。

---

## 九、Tooltip 的演进:同一个问题的多种解法

把今天的讨论串成一条演进线:

```
原始 Tooltip(text + children)
    ↓ 加自定义浮层需求
方案一:增加 content prop(无 IoC,只是多个 prop)
    ↓ 浮层需要内部状态(如 close 函数)
方案二:render prop(IoC 通过函数参数注入状态)
    ↓ 多个插槽都需要内部状态,而且想要更声明式的 API
方案三:Compound Components(IoC 通过 Context 注入状态)
```

每一步都是为了**让调用方拿到本来够不着的内部状态**——注入机制从 "prop" → "函数参数" → "Context" 逐级升级。

这是同一个问题(子组件如何访问父组件状态)的不同解法,**本质都是 IoC,只是注入媒介不同**。

---

## 十、相关模式速览

Compound Components 有几个常见变体和相关模式:

### 10.1 Flexible Compound Components(灵活复合组件)

允许子组件在嵌套结构里随意放置:

```tsx
<Tooltip>
  <div className="wrapper">
    <Tooltip.Trigger>...</Tooltip.Trigger>  {/* 不必是直接子元素 */}
  </div>
  <Tooltip.Content>...</Tooltip.Content>
</Tooltip>
```

这正是用 Context 实现的好处——子组件不必是父组件的直接 children,只要在 Provider 子树内就行。

### 10.2 Slot Pattern(插槽模式)

用 `asChild` 等 prop 让子组件接管自身渲染:

```tsx
<Tooltip.Trigger asChild>
  <button>自定义按钮</button>  {/* 不被 span 包裹,直接给 button 加属性 */}
</Tooltip.Trigger>
```

Radix UI 大量使用这种模式,需要用到 `React.cloneElement` 或 `Slot` 组件。

### 10.3 State Reducer Pattern(状态归约器)

允许调用方接管父组件的状态变更逻辑:

```tsx
<Tooltip stateReducer={(state, action) => { ... }}>
```

Kent C. Dodds 推广的高级模式,适合非常通用的库组件。

---

## 十一、心法总结

1. **Compound Components 的本质是 Context 注入**——不是什么神秘魔法
2. **`Tooltip.Trigger = Trigger` 不是语法糖**——就是给函数对象挂属性
3. **抛错优于 null**——`useXxxContext` 中检测 null 并抛出明确错误
4. **父组件做协调,子组件做渲染**——职责分离比都堆在父组件清晰
5. **多插槽 → Compound;单插槽 + 状态 → render prop**——没有银弹
6. **Tree-shaking 关心 → 独立导出**;**API 整洁关心 → 点访问**
7. **配合 IoC 视角看**:render prop 注入函数参数,Compound 注入 Context

---

## 十二、一句话总结

> **Compound Components 让你像组装乐高一样使用组件——父组件提供"协调中枢",子组件按需要取用其中的状态;调用方写出的 JSX 在视觉上像 HTML,在机制上是 Context 驱动的多插槽 IoC。**

---

## 十三、扩展阅读方向

- **Radix UI 源码**: 工业级 Compound Components 的标准实现
- **Headless UI 源码**: 另一种点访问语法的代表
- **React.cloneElement 与 Slot 模式**: 实现 `asChild` 的关键
- **useImperativeHandle + forwardRef**: 让父组件主动调用子组件方法
- **Kent C. Dodds 的 "Advanced React Patterns"**: 系统讲解组件设计模式
- **Compound Components vs Render Props vs Hooks**: 三种 IoC 范式的演进
- **Context 性能优化**: `useMemo`、context 拆分、`use-context-selector`
