# JSX 中返回多个元素 & 把 JSX 当数组用

> 场景：在 `.map()` 里想返回多个并列的 JSX 元素，或者想先把 JSX 存成数组，再在别处渲染。
> 涉及到 React Fragment、`key` 处理、JSX 的本质等知识点。

## 目录

- [JSX 不能并列返回多个元素](#jsx-不能并列返回多个元素)
- [包裹多个元素的三种方式](#包裹多个元素的三种方式)
- [Fragment 简写 vs 完整写法](#fragment-简写-vs-完整写法)
- [把 JSX 存成数组再渲染](#把-jsx-存成数组再渲染)
- [常见用途](#常见用途)
- [JSX 元素 vs HTML 字符串](#jsx-元素-vs-html-字符串)
- [速记](#速记)

---

## JSX 不能并列返回多个元素

```tsx
// ❌ 语法错误：函数 / 三元分支只能返回一个根元素
return (
  <span>A</span>
  <span>B</span>
);

// ❌ 三元运算符的分支并列两个元素也不行
{condition ? (
  <span>A</span>
  <span>B</span>
) : (
  <span>C</span>
)}
```

原因：JSX 编译后是 `React.createElement(...)` 调用，函数只能返回一个值。

---

## 包裹多个元素的三种方式

```tsx
// ✅ Fragment 简写
<>
  <span>A</span>
  <span>B</span>
</>

// ✅ Fragment 完整写法（需要传 key 时用）
<React.Fragment key={x}>
  <span>A</span>
  <span>B</span>
</React.Fragment>

// ✅ 真实 DOM 容器
<div>
  <span>A</span>
  <span>B</span>
</div>
```

**Fragment 不会产生真实 DOM 节点**，是它的最大价值——避免无意义的 `<div>` 嵌套。

---

## Fragment 简写 vs 完整写法

| 写法 | 能传 `key` | 适用场景 |
|------|-----------|---------|
| `<>...</>` | ❌ 不能 | 普通包裹 |
| `<React.Fragment key={x}>...</React.Fragment>` | ✅ 能 | 在 `.map()` 中需要 key |

```tsx
// ❌ 在 map 中用简写会丢失 key，React 会警告
items.map(item => (
  <>
    <span>{item.name}</span>
    <span>{item.value}</span>
  </>
));

// ✅ 必须用完整写法
items.map(item => (
  <React.Fragment key={item.id}>
    <span>{item.name}</span>
    <span>{item.value}</span>
  </React.Fragment>
));
```

---

## 把 JSX 存成数组再渲染

JSX 元素本质上就是 JavaScript 对象（类型 `React.ReactNode`），可以像普通值一样存在变量、数组里，传来传去。

```tsx
// 1. 先生成 JSX 数组
const headerElements = columns.map(col => (
  <React.Fragment key={col.key}>
    <span>{col.label}</span>
    {col.tooltip && (
      <Tooltip text={col.tooltip}>
        <span style={{ textDecoration: 'underline dotted', cursor: 'help' }}>
          了解更多
        </span>
      </Tooltip>
    )}
  </React.Fragment>
));

// 2. 想在哪里渲染就在哪里渲染
return (
  <thead>
    <tr>{headerElements}</tr>
  </thead>
);
```

### 加上类型标注（可选）

```tsx
const headerElements: React.ReactNode[] = columns.map(col => (
  <React.Fragment key={col.key}>
    {/* ... */}
  </React.Fragment>
));
```

---

## 常见用途

### 1. 拆分渲染位置

```tsx
const items = data.map(d => <Item key={d.id} {...d} />);

return (
  <>
    <header>共 {items.length} 项</header>
    <main>{items}</main>
  </>
);
```

### 2. 条件性插入分隔符

```tsx
const elements = data.map(d => <Item key={d.id} {...d} />);

const withDividers = elements.flatMap((el, i) =>
  i === 0 ? [el] : [<Divider key={`d-${i}`} />, el]
);

return <div>{withDividers}</div>;
```

### 3. 传给子组件作为 props

```tsx
<Layout sidebar={sidebarItems} content={contentItems} />
```

### 4. 根据条件过滤后再渲染

```tsx
const visibleRows = rows
  .map(row => <Row key={row.id} {...row} />)
  .filter((_, i) => i < pageSize);

return <tbody>{visibleRows}</tbody>;
```

---

## JSX 元素 vs HTML 字符串

容易混淆的概念：JSX 不是字符串，是对象。

```tsx
// JSX 元素（React 对象）
const el = <span>hello</span>;
console.log(el);
// { type: 'span', props: { children: 'hello' }, ... }

// 真正的 HTML 字符串需要 renderToString
import { renderToString } from 'react-dom/server';
const html = renderToString(<span>hello</span>);
// "<span>hello</span>"
```

| 需求 | 应该用 |
|------|--------|
| 在 React 组件里渲染 | **JSX 元素 / 数组**（99% 场景） |
| 邮件模板、SSR 输出、写入文件 | `ReactDOMServer.renderToString()` |
| 字符串拼接 / 存数据库 | `renderToString` 或干脆别用 React |

---

## 速记

- **JSX 不能并列返回多个元素** → 用 Fragment 包裹
- **`<>...</>` 不能传 `key`** → 在 `.map()` 中改用 `<React.Fragment key={...}>`
- **JSX 是对象不是字符串** → 可以存数组、变量，像普通值一样传递
- **类型是 `React.ReactNode`** → 数组就是 `React.ReactNode[]`
- **真要 HTML 字符串** → `renderToString()`，但场景很少

### 一行口诀

> JSX 是值不是模板，能存就能传；多元素必包裹，列表中必带 key。
