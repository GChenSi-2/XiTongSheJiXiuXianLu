## TypeScript Cheatsheet

一份覆盖日常开发常用语法的 TypeScript 速查手册。

### 目录

- [变量与基本类型](#变量与基本类型)
- [数组与元组](#数组与元组)
- [对象与接口](#对象与接口)
- [函数](#函数)
- [模板字符串（Template Literals）](#模板字符串template-literals)
- [循环遍历](#循环遍历)
- [数组常用方法](#数组常用方法)
- [Map 与 Set](#map-与-set)
- [类（Class）](#类class)
- [泛型（Generics）](#泛型generics)
- [工具类型（Utility Types）](#工具类型utility-types)
- [类型守卫与断言](#类型守卫与断言)
- [枚举（Enum）](#枚举enum)
- [模块（Import / Export）](#模块import--export)

---

### 变量与基本类型

```typescript
// 基本类型
let name: string = "Silicon";
const age: number = 25;
let isActive: boolean = true;
let nothing: null = null;
let notDefined: undefined = undefined;

// 类型推断（推荐，无需显式标注）
let city = "Tokyo";  // 自动推断为 string

// 联合类型
let id: string | number = 123;

// 字面量类型
let status: "pending" | "success" | "error" = "pending";

// any / unknown / never
let anything: any = 42;          // 关闭类型检查（避免使用）
let safeAny: unknown = "hello";  // 安全的 any，使用前需类型检查
function throwError(): never { throw new Error(); }

// 类型别名
type UserId = string | number;
let uid: UserId = "u_001";
```

---

### 数组与元组

```typescript
// 数组（两种写法等价）
let nums: number[] = [1, 2, 3];
let nums2: Array<number> = [1, 2, 3];

// 联合类型数组
let mixed: (string | number)[] = ["a", 1, "b", 2];

// 只读数组
const readonlyNums: readonly number[] = [1, 2, 3];

// 二维数组
let matrix: number[][] = [[1, 2], [3, 4]];

// 元组（固定长度和类型）
let tuple: [string, number, boolean] = ["Silicon", 25, true];
```

---

### 对象与接口

```typescript
// 内联类型
let user: { name: string; age: number } = { name: "Silicon", age: 25 };

// interface（推荐用于对象/类）
interface User {
  readonly id: number;      // 只读
  name: string;
  age?: number;             // 可选属性
  [key: string]: any;       // 索引签名
}

// type（推荐用于联合/工具类型）
type Point = { x: number; y: number };

// interface 继承
interface Admin extends User {
  role: string;
}

// 交叉类型（type 的"继承"）
type SuperUser = User & { permissions: string[] };

// Record（键值对对象）
const scores: Record<string, number> = { math: 90, english: 85 };

// 取出对象全部 key
const obj = { name: "Alice", age: 25, active: true };

// ① Object.keys()：运行时，返回 string[]
const keys = Object.keys(obj);              // ["name", "age", "active"]

// ② keyof（类型层面）：得到所有 key 的联合类型
type ObjKeys = keyof typeof obj;            // "name" | "age" | "active"

// 常见用途：约束函数参数只能是对象已有的 key
function getVal<T extends object>(o: T, key: keyof T) {
  return o[key];
}
getVal(obj, "name");   // ✅
getVal(obj, "email");  // ❌ 编译报错

// ③ 配合 Object.keys() 遍历并保持类型安全
(Object.keys(obj) as (keyof typeof obj)[]).forEach(key => {
  console.log(key, obj[key]);  // key 有类型提示，obj[key] 不报错
});
```

> **interface vs type**：对象/类结构优先用 `interface`（可被 extends/implements、可声明合并）；联合、交叉、工具类型用 `type`。

---

### 函数

```typescript
// 函数声明
function add(a: number, b: number): number {
  return a + b;
}

// 箭头函数
const multiply = (a: number, b: number): number => a * b;

// 可选参数 / 默认参数
function greet(name: string, greeting: string = "Hello"): string {
  return `${greeting}, ${name}`;
}

// Rest 参数
function sum(...nums: number[]): number {
  return nums.reduce((acc, n) => acc + n, 0);
}

// 函数类型别名
type BinaryOp = (a: number, b: number) => number;
const subtract: BinaryOp = (a, b) => a - b;

// 函数重载
function parse(x: string): string[];
function parse(x: number): number;
function parse(x: any): any {
  return typeof x === "string" ? x.split("") : x * 2;
}
```

---

### 模板字符串（Template Literals）

> 用**反引号** `` ` `` 包裹字符串，通过 `${}` 嵌入变量或任意表达式，替代繁琐的 `+` 拼接。

```typescript
const name = "Alice";
const age = 25;

// ❌ 旧写法：+ 拼接，容易漏空格
const msg1 = "Hello, " + name + "! You are " + age + " years old.";

// ✅ 模板字符串：直接嵌入变量
const msg2 = `Hello, ${name}! You are ${age} years old.`;

// ${}  内可放任意表达式
const a = 3, b = 4;
`结果是 ${a + b}`              // "结果是 7"（运算）
`${a > 0 ? "正数" : "负数"}`   // "正数"（三元表达式）
`长度：${name.length}`         // "长度：5"（属性访问）
`${name.toUpperCase()}`        // "ALICE"（方法调用）
`第 ${i + 1} 项`               // 下标 +1，避免从 0 显示

// 多行字符串（普通引号无法换行）
const sql = `
  SELECT *
  FROM users
  WHERE age > ${age}
`;
```

| 写法 | 符号 | 支持 `${}` | 支持换行 |
|------|------|-----------|---------|
| `` `hello ${name}` `` | 反引号 | ✅ | ✅ |
| `"hello " + name` | 双引号 | ❌ | ❌ |
| `'hello ' + name` | 单引号 | ❌ | ❌ |

> **一句话**：只要字符串里需要塞变量或表达式，就把 `"…"` 换成 `` `…${变量}…` ``。

---

### 循环遍历

```typescript
const arr = [10, 20, 30];

// for 经典循环
for (let i = 0; i < arr.length; i++) {
  console.log(arr[i]);
}

// for...of（遍历值，支持 break/continue）
for (const item of arr) {
  console.log(item);
}

// for...in（遍历键，主要用于对象）
const obj = { a: 1, b: 2, c: 3 };
for (const key in obj) {
  console.log(key, obj[key as keyof typeof obj]);
}

// 对象遍历
Object.keys(obj).forEach(k => console.log(k));
Object.values(obj).forEach(v => console.log(v));
Object.entries(obj).forEach(([k, v]) => console.log(k, v));
```

---

### 数组常用方法

#### `.forEach()` —— 执行副作用

```typescript
arr.forEach((item, index) => console.log(index, item));
// 返回 undefined，无法 break（用 for...of 代替）
```

#### `.map()` —— 转换并返回新数组

```typescript
// 基础：每个元素 ×2
const doubled = [1, 2, 3].map(n => n * 2);  // [2, 4, 6]

// 改变类型（number → string）
const strs: string[] = [1, 2, 3].map(n => n.toString());

// 提取对象字段
interface User { id: number; name: string; }
const users: User[] = [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }];
const names = users.map(u => u.name);   // ["Alice", "Bob"]

// 转换对象结构（⚠️ 返回对象字面量必须用括号包裹）
const options = users.map(u => ({ label: u.name, value: u.id }));

// 带索引：回调第二个参数是当前下标
const withIndex = ["a", "b", "c"].map((item, index) => `${index}: ${item}`);
// ["0: a", "1: b", "2: c"]

// 完整签名：(currentValue, index, array) => newValue
const doubled2 = [1, 2, 3].map((n, i, arr) => {
  console.log(`arr[${i}] = ${n}, total = ${arr.length}`);
  return n * 2;
});

// 索引生成数组
const range = Array.from({ length: 5 }, (_, i) => i);  // [0,1,2,3,4]

// ── React / JSX：返回组件 ────────────────────────────────
// ⚠️ 必须给每个元素加 key prop（唯一标识，帮助 React 做 diff）
// key 优先用数据的唯一 id，没有时才退而求其次用 index

// 方式 1：箭头函数单行（返回 JSX，外层加括号）
const listItems = users.map(u => (
  <li key={u.id}>{u.name}</li>
));

// 方式 2：需要逻辑时，用花括号 + return
const cards = users.map((u, index) => {
  const label = index === 0 ? "⭐ " + u.name : u.name;
  return (
    <div key={u.id} className="card">
      <span>{label}</span>
    </div>
  );
});

// 方式 3：直接内联在 JSX 中
function UserList() {
  return (
    <ul>
      {users.map(u => (
        <li key={u.id}>{u.name}</li>
      ))}
    </ul>
  );
}
```

#### `.filter()` / `.reduce()` / `.find()`

```typescript
const evens = [1, 2, 3, 4].filter(n => n % 2 === 0);     // [2, 4]
const total = [1, 2, 3, 4].reduce((acc, n) => acc + n, 0); // 10
const found = [1, 2, 3, 4].find(n => n > 2);             // 3
```

#### `.flatMap()` —— Map + Flat

```typescript
["hello world", "foo bar"].flatMap(s => s.split(" "));
// ["hello", "world", "foo", "bar"]
```

#### 链式调用

```typescript
[1, 2, 3, 4, 5]
  .filter(n => n % 2 === 0)
  .map(n => n * 10)
  .reduce((sum, n) => sum + n, 0);  // 60
```

#### 方法对比

| 方法 | 返回值 | 用途 |
|------|--------|------|
| `.map()` | 新数组（等长） | **转换**数据 |
| `.forEach()` | `undefined` | **副作用**（打印、修改外部变量） |
| `for…of` | 无 | 支持 `break`/`continue` |
| `.filter()` | 新数组（可能更短） | 筛选 |
| `.reduce()` | 任意值 | 累计/聚合 |

---

### Map 与 Set

#### Map

```typescript
// 创建
const userMap = new Map<string, number>();
const scoreMap = new Map<string, number>([
  ["alice", 90],
  ["bob", 85]
]);

// 增删改查
userMap.set("alice", 30).set("bob", 25);  // 链式调用
userMap.get("alice");                      // 30，不存在返回 undefined
userMap.has("alice");                      // true
userMap.delete("bob");
userMap.size;                              // 属性，非方法
// userMap.clear();

// 遍历（forEach 参数顺序：value 在前！）
userMap.forEach((value, key) => console.log(key, value));

// for...of 解构（最常用，Map 默认迭代器就是 entries）
for (const [key, value] of userMap) {
  console.log(key, value);
}

// 单独遍历键/值
for (const key of userMap.keys()) { /* ... */ }
for (const value of userMap.values()) { /* ... */ }

// Map ↔ 数组/对象互转
const arr = Array.from(userMap);              // [[key, value], ...]
const spread = [...userMap];                  // 同上
const plainObj = Object.fromEntries(userMap); // 转普通对象
const fromObj = new Map(Object.entries({ a: 1, b: 2 }));

// 对 Map 使用 map / filter（先转数组）
const filtered = new Map([...userMap].filter(([k, v]) => v > 25));

// WeakMap：键必须是对象，不可遍历，自动 GC
const cache = new WeakMap<object, string>();
```

> **Map vs 普通对象**：键可以是任意类型、保持插入顺序、有 `size`、频繁增删性能更好。

#### Set

```typescript
const set = new Set<number>([1, 2, 3]);
set.add(4);
set.has(1);
set.delete(2);

set.forEach(v => console.log(v));
for (const v of set) console.log(v);

// 数组去重经典用法
const unique = [...new Set([1, 1, 2, 3, 3])];  // [1, 2, 3]
```

---

### 类（Class）

```typescript
class Animal {
  // 访问修饰符: public（默认）/ private / protected / readonly
  private name: string;
  protected age: number;
  readonly species: string;

  constructor(name: string, age: number, species: string) {
    this.name = name;
    this.age = age;
    this.species = species;
  }

  // 简写：参数属性（自动赋值给 this）
  // constructor(private name: string, public age: number) {}

  greet(): string {
    return `I'm ${this.name}`;
  }

  static create(name: string): Animal {
    return new Animal(name, 0, "unknown");
  }
}

// 继承
class Dog extends Animal {
  constructor(name: string, age: number) {
    super(name, age, "dog");
  }
  bark() { console.log("Woof!"); }
}

// 抽象类
abstract class Shape {
  abstract area(): number;
}

// 实现接口
interface Printable { print(): void; }
class Book implements Printable {
  print() { console.log("printing..."); }
}
```

---

### 泛型（Generics）

```typescript
// 泛型函数
function identity<T>(value: T): T {
  return value;
}
identity<string>("hello");
identity(42);  // 类型推断

// 泛型约束
function getLength<T extends { length: number }>(item: T): number {
  return item.length;
}

// 多个类型参数
function pair<K, V>(key: K, value: V): [K, V] {
  return [key, value];
}

// 泛型接口/类
interface Box<T> { value: T; }

class Stack<T> {
  private items: T[] = [];
  push(item: T) { this.items.push(item); }
  pop(): T | undefined { return this.items.pop(); }
}
```

---

### 工具类型（Utility Types）

```typescript
interface User { id: number; name: string; email: string; }

type PartialUser = Partial<User>;        // 全部可选
type RequiredUser = Required<User>;      // 全部必填
type ReadonlyUser = Readonly<User>;      // 全部只读
type UserName = Pick<User, "name">;      // 选择某些字段
type NoEmail = Omit<User, "email">;      // 排除某些字段

type Roles = "admin" | "user" | "guest";
type RoleMap = Record<Roles, number>;    // { admin: number; user: number; guest: number }

type Excluded = Exclude<"a" | "b" | "c", "a">;   // "b" | "c"
type Extracted = Extract<"a" | "b", "a" | "c">;  // "a"
type ReturnT = ReturnType<() => string>;         // string
type Params = Parameters<(a: number, b: string) => void>;  // [number, string]
```

---

### 类型守卫与断言

```typescript
// typeof
function format(val: string | number) {
  if (typeof val === "string") return val.toUpperCase();
  return val.toFixed(2);
}

// instanceof
if (err instanceof Error) console.log(err.message);

// in 操作符
if ("name" in obj) { /* ... */ }

// 自定义类型守卫
function isUser(x: any): x is User {
  return x && typeof x.id === "number";
}

// 类型断言
const el = document.getElementById("app") as HTMLDivElement;

// 非空断言
const value = maybeNull!.toString();
```

---

### 枚举（Enum）

```typescript
// 数字枚举（默认从 0 开始）
enum Direction { Up, Down, Left, Right }

// 字符串枚举（推荐：可读性更好）
enum Status {
  Pending = "PENDING",
  Success = "SUCCESS",
  Error = "ERROR"
}

// const enum（编译时内联，零运行时开销）
const enum Level { Low, Mid, High }
```

---

### 模块（Import / Export）

```typescript
// 命名导出
export const PI = 3.14;
export function add(a: number, b: number) { return a + b; }
export interface User { name: string; }

// 默认导出
export default class Logger { /* ... */ }

// 导入
import Logger, { PI, add, type User } from "./module";
import * as Utils from "./utils";
import type { Config } from "./types";  // 仅导入类型，编译后会被擦除
```

---

### 速记小贴士

- **类型推断优先**：能让 TS 推断的就别手写类型
- **`unknown` 比 `any` 安全**：能用 `unknown` 就别用 `any`
- **对象用 `interface`，联合/工具类型用 `type`**
- **`.map()` 输入数组 → 输出等长新数组**，副作用用 `.forEach()`
- **`Map.forEach((value, key) => …)`** 注意参数顺序与数组相反
- **箭头函数返回对象字面量要用括号**：`() => ({ x: 1 })`
- **`readonly` 防止修改，`as const` 锁定字面量类型**


### Playground
<https://stackblitz.com/edit/react-ts-hzzc8yat?file=App.tsx>