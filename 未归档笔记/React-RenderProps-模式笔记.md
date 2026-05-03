# React Render Props 模式：为什么调用方"没赋值"也能工作

> 本笔记从一个关于 Tooltip render prop 的疑问出发,解释为什么调用方写 `({ close }) => ...` 时看起来"没传值",但内部依然能拿到真实的 `close` 函数。核心是理解**函数定义**与**函数调用**的时机差异。

---

## 一、问题的起点

考虑这样一个 Tooltip 组件设计:

```tsx
type TooltipRenderProps = {
  visible: boolean;
  close: () => void;
  coords: { left: number; top: number };
};

type TooltipProps = {
  children: ReactNode;
  popup: ReactNode | ((p: TooltipRenderProps) => ReactNode);  // 关键
  offset?: number;
  className?: string;
};

// 渲染部分
{visible &&
  createPortal(
    <PositionedLayer ref={floatRef} left={coords.left} top={coords.top}>
      {typeof popup === 'function'
        ? popup({ visible, close: () => setVisible(false), coords })
        : popup}
    </PositionedLayer>,
    document.body
  )}
```

调用方这样写:

```tsx
<Tooltip popup={({ close }) => <button onClick={close}>关闭</button>}>
  <QuestionIcon />
</Tooltip>
```

### 一个常见的疑问

> "组件内部已经给 `popup` 传参附了值,我调用方再写 `({ close }) =>` 不就被覆盖了吗?这不矛盾吗?"

**结论**: 不矛盾。这两次"传值"发生在**不同维度、不同时机**,实际上是**协作关系**——调用方提供配方,组件提供食材。

---

## 二、关键区分:函数定义 vs 函数调用

### 2.1 两次"传值"是不同的事

| 时机 | 谁做的 | 做了什么 |
|---|---|---|
| **JSX 渲染时** | 调用方 | 把"函数定义"作为 prop 传进去 |
| **组件内部需要时** | Tooltip 自己 | 用真实状态调用这个函数 |

```tsx
// 第 1 次:调用方写组件时
<Tooltip popup={({ close }) => <button onClick={close}>关闭</button>}>
//              ^^^^^^^^^^^^^^^
//              这是"函数定义",没有任何值被传递
```

调用方传给 `popup` 的是**一个函数对象**——一个"还没执行的配方"。这一步**没有传任何参数值**,调用方只是定义了"如果有人给我 `close`,我就这样用它"。

```tsx
// 第 2 次:组件内部
popup({ visible, close: () => setVisible(false), coords })
//     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//     这才是真正的"传值",把运行时数据塞进函数
```

组件**调用**这个函数时,才把 `visible`、`close`、`coords` 这些真实运行时的值塞进去。

### 2.2 形参名不是值

```tsx
popup={({ close }) => <button onClick={close}>关闭</button>}
//      ^^^^^^^^^
//      这里的 close 只是形参名,不是值
```

`{ close }` 是 JS 的**解构语法**——它在说:"当有人调用这个函数并传一个对象进来时,我要从那个对象里取出叫 `close` 的字段。"它本身**不携带任何值**,只是一个占位符。

---

## 三、用纯 JS 类比

把 React 拿掉,本质就是:

```ts
// 第 1 步:定义函数,参数 x 只是占位符
const recipe = (x) => `结果是 ${x * 2}`;

// 第 2 步:真正调用时才决定 x 的值
recipe(10);  // "结果是 20"
recipe(99);  // "结果是 198"
```

写 `(x) => ...` 的时候有"给 x 赋值"吗?**没有**。`x` 只是函数签名里的占位符。真正的赋值发生在 `recipe(10)` 这一刻。

回到 Tooltip 的场景:

```tsx
const popup = ({ close }) => <button onClick={close}>关闭</button>;
//             ^^^^^^^^^
//             形参,等待外部传入

// Tooltip 内部:
popup({ close: () => setVisible(false), ... });
//      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//      实参,真正的值
```

调用方写函数体时**不知道**也**不需要知道** `close` 具体是什么——它只是相信"调用我的人会给我一个 close"。

---

## 四、用蛋糕食谱再理解一次

回到之前的"配方 vs 成品"比喻:

- 调用方传的 `({ close }) => <button onClick={close}>关闭</button>` 是一份**食谱**
- 食谱上写着:"请给我 `close` 这个食材,我会用它做出一个按钮"
- Tooltip 内部到了运行时,**真的拿出 `close` 这个食材交给食谱**,食谱才被执行,产出成品(一个真实的 `<button>`)

| 概念 | 对应 |
|---|---|
| 食谱(配方) | `({ close }) => <button onClick={close} />` 这个函数定义 |
| 食材 | `close: () => setVisible(false)` 这个真实的值 |
| 厨师 | Tooltip 组件内部 |
| 成品 | 渲染出的 `<button>` Element |

调用方负责写食谱(说明用法),Tooltip 负责提供食材并执行食谱。

---

## 五、用 console.log 验证

如果不放心,可以临时改成这样观察:

```tsx
<Tooltip
  popup={(props) => {
    console.log('我被调用了!收到的参数:', props);
    return <button onClick={props.close}>关闭</button>;
  }}
>
  <QuestionIcon />
</Tooltip>
```

实际行为:

- 调用方写这段 JSX 时,`console.log` **不会触发**(函数还没被调用,只是被定义了)
- 鼠标 hover 触发 `visible = true` 后,Tooltip 内部执行 `popup({...})`,`console.log` 这时才触发,打印出真实的 `{ visible, close, coords }`

这清楚地说明了**两次操作发生在不同时机**。

---

## 六、反例:如果调用方真的自己调用了函数

如果调用方"画蛇添足"地自己调用了这个函数:

```tsx
{/* ❌ 反例:调用方自己调用了函数 */}
<Tooltip 
  popup={
    (({ close }) => <button onClick={close}>关闭</button>)({ close: () => {} })
  }
>
```

会发生什么:

1. `popup` 收到的不再是函数,而是函数**执行后的返回值**(一个 ReactElement)
2. Tooltip 内部 `typeof popup === 'function'` 判断为 `false`,走另一个分支直接渲染
3. `close` 变成了调用方传的那个空函数,**跟 Tooltip 内部状态完全无关**——按钮点了也关不掉 tooltip

这种写法把 render props 的精髓彻底破坏了——但也从反面证明:**正常用法下根本没有"调用方传值"这回事**。

---

## 七、为什么 render prop 要这么设计?

### 7.1 静态 ReactNode 的局限

如果只允许传静态 ReactNode,会遇到问题:

```tsx
{/* 静态 ReactNode:close 从哪来? */}
popup={<button onClick={???}>关闭</button>}
//                      ^^^
//      调用方拿不到 Tooltip 内部的 setVisible
```

ReactNode 是**已经渲染好的成品**,它在被传入 Tooltip 之前就已经"定型"了——无法响应组件内部状态变化,也无法访问组件内部的方法。

### 7.2 render prop 的本质:控制反转(IoC)

```tsx
{/* render prop:close 由 Tooltip 在运行时注入 */}
popup={({ close }) => <button onClick={close}>关闭</button>}
//      ^^^^^^^
//      占位符,等 Tooltip 注入真正的 close
```

对比两种模式的"控制权归属":

| 模式 | 谁提供值 | 谁决定如何使用 |
|---|---|---|
| 普通 prop | 调用方 | 组件被动接收 |
| **render prop** | **组件内部** | **调用方决定如何使用** |

这就是**控制反转(Inversion of Control)**:

- 调用方放弃了"提供 `close` 的值"这个权力
- 但获得了"决定 `close` 怎么被用"的权力
- 组件内部反过来掌握了"何时、用什么 `close`"的权力

这不是 bug,是 feature——正是这种设计让"调用方写出的 JSX"能访问到"组件内部的状态和方法"。

---

## 八、和普通 children 的对比

回到笔记一开始就建立的"成品 vs 配方"框架:

| 模式 | 传入的是 | 类型 | 何时"求值" |
|---|---|---|---|
| 普通 children | 已经做好的**成品** | `ReactNode` | JSX 渲染时就已经求值完毕 |
| render prop | **配方**(函数) | `(args) => ReactNode` | 组件内部决定何时调用 |

```tsx
// 普通 children:成品
<Tooltip>
  <button onClick={() => alert('我无法关闭 tooltip')}>关闭</button>
</Tooltip>

// render prop:配方
<Tooltip popup={({ close }) => 
  <button onClick={close}>我能真正关闭 tooltip</button>
} />
```

两种模式各有适用场景:

- **普通 children**: 子内容不依赖父组件的内部状态时,简单直接
- **render prop**: 子内容需要响应父组件状态、调用父组件方法时

---

## 九、识别 render props 的几个特征

写代码时看到这些信号,基本就是 render prop 模式:

1. **prop 类型包含 `(args) => ReactNode`**
   ```tsx
   popup: ReactNode | ((p: TooltipRenderProps) => ReactNode);
   ```

2. **组件内部用 `typeof xxx === 'function'` 判断**
   ```tsx
   typeof popup === 'function' ? popup({...}) : popup
   ```

3. **传入的 prop 是一个"看起来空空的函数"**
   ```tsx
   popup={({ close, visible }) => /* 用这些 */}
   ```

4. **TypeScript 推断出形参类型,但调用方没"提供"这些值**
   ——因为这些值会由组件内部注入

---

## 十、一句话总结

> 调用方传 `({ close }) => ...` 时,`close` 只是**形参名**(占位符),不携带值。真正的值由 Tooltip 内部在调用 `popup({...})` 那一刻注入。两次操作发生在不同时机,互不冲突——这正是 render props 模式能让"调用方写出的 JSX"访问到"组件内部状态"的关键机制。

---

## 十一、心法速查

1. **形参 ≠ 实参**:函数定义里的 `({ close })` 是形参,不是值
2. **定义 ≠ 调用**:写函数时不执行,只在被调用时才执行
3. **配方 ≠ 成品**:render prop 传配方,普通 children 传成品
4. **控制反转**:调用方放弃"提供值"的权力,换来"决定怎么用"的权力
5. **看到 `typeof x === 'function'`**:大概率是 render prop 模式

---

## 十二、扩展阅读方向

如果想继续深入,可以了解:

- **Compound Components**: 用 `Tabs.List` / `Tabs.Panel` 这种命名子组件实现多插槽
- **Children as Function**: render prop 的特殊形式,直接把函数作为 children 传入
- **`useImperativeHandle` + `forwardRef`**: 让父组件主动调用子组件的方法,另一种控制反转
- **Hooks 模式**: 现代 React 中,很多 render prop 的需求被自定义 Hook 替代了
