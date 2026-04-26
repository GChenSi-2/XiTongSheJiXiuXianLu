# 用数组的字符串键去对象取值：写法与场景

> 场景：有一个字符串数组（如 `["head", "body", "foot"]`），有一个对象（键名包含这些字符串），想按数组顺序取出对象里对应的值。
> 这是 TypeScript / JavaScript 日常开发中最高频的操作之一。

## 目录

- [核心写法](#核心写法)
- [类型安全的写法](#类型安全的写法)
- [处理键可能不存在](#处理键可能不存在)
- [常见使用场景](#常见使用场景)
- [背后的设计思想](#背后的设计思想)
- [日常开发四大金刚](#日常开发四大金刚)

---

## 核心写法

```typescript
const keys = ["head", "body", "foot"];
const obj = {
  head: "标题内容",
  body: "正文内容",
  foot: "页脚内容",
  extra: "额外内容"
};

const values = keys.map(key => obj[key as keyof typeof obj]);
// ["标题内容", "正文内容", "页脚内容"]
```

**关键点**：`as keyof typeof obj` 告诉 TypeScript "这个 key 一定是 obj 的合法键"，否则会报错：

```
Element implicitly has an 'any' type because expression of type 'string' can't be used to index type ...
```

---

## 类型安全的写法

如果能在源头限制好类型，就不用每次都断言：

### 方式一：限制数组类型

```typescript
const keys: (keyof typeof obj)[] = ["head", "body"];
const values = keys.map(key => obj[key]);  // 不需要 as
```

### 方式二：用 `as const` 锁定字面量

```typescript
const keys = ["head", "body"] as const;
const values = keys.map(key => obj[key]);  // key 推断为 "head" | "body"
```

---

## 处理键可能不存在

数组里的字符串不一定都在对象中时，需要先过滤：

```typescript
const keys = ["head", "body", "unknown_key"];
const obj: Record<string, string> = {
  head: "标题内容",
  body: "正文内容"
};

// 先 filter 再 map
const values = keys
  .filter(key => key in obj)
  .map(key => obj[key]);

// 或一步到位用 flatMap
const values2 = keys.flatMap(key => key in obj ? [obj[key]] : []);
```

### 同时拿到 key 和 value

```typescript
const pairs = keys
  .filter(key => key in obj)
  .map(key => ({ key, value: obj[key] }));
// [{ key: "head", value: "标题内容" }, ...]
```

---

## 常见使用场景

### 1. 表格/列表渲染（最高频）

后端返回完整对象，前端按指定列顺序渲染：

```typescript
const user = { id: 1, name: "Alice", email: "a@x.com", age: 25, phone: "..." };
const columns = ["name", "email", "age"];
const row = columns.map(col => user[col as keyof typeof user]);
// ["Alice", "a@x.com", 25]
```

> Element UI、Ant Design 的 `columns` 配置都是这个模式。

### 2. 表单字段批量校验

```typescript
const formData = { username: "abc", email: "x@y.z", password: "123" };
const requiredFields = ["username", "email", "password"];

const missing = requiredFields.filter(
  f => !formData[f as keyof typeof formData]
);
```

### 3. 国际化（i18n）取文案

```typescript
const messages = { hello: "你好", bye: "再见", thanks: "谢谢" };
const keysToShow = ["hello", "thanks"];
const texts = keysToShow.map(k => messages[k as keyof typeof messages]);
```

### 4. 配置驱动的 UI

```typescript
const config = ["name", "avatar", "bio"];  // 可能来自后端
const profile = { name: "...", avatar: "...", bio: "...", email: "..." };

config.forEach(field => render(profile[field as keyof typeof profile]));
```

### 5. 对象子集提取（lodash `_.pick` 原理）

```typescript
function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach(k => { result[k] = obj[k]; });
  return result;
}

pick(user, ["name", "email"]);  // { name, email }
```

### 6. CSV / Excel 导出

```typescript
const headers = ["name", "age", "email"];
const users = [{ name: "A", age: 20, email: "..." }, /* ... */];

const csv = [
  headers.join(","),
  ...users.map(u => headers.map(h => u[h as keyof typeof u]).join(","))
].join("\n");
```

### 7. 多字段排序

```typescript
const sortKeys = ["priority", "createdAt"];
items.sort((a, b) => {
  for (const key of sortKeys) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  return 0;
});
```

### 8. 动态读取 API 响应字段

```typescript
const response = { data: {...}, meta: {...}, errors: [...] };
const fieldsToLog = ["data", "errors"];
fieldsToLog.forEach(f => console.log(response[f as keyof typeof response]));
```

---

## 背后的设计思想

这些场景的本质是 **「数据」和「展示/操作顺序」分离**：

| 角色 | 用什么 | 特点 |
|------|--------|------|
| 数据存储 | **对象** | 无序、键值对、完整 |
| 展示顺序/字段筛选 | **数组** | 有序、可配置、是数据的"视图" |

只要遇到 "我有一坨数据，但只想要其中几个字段，并且顺序我说了算" —— 就是这个模式。

---

## 日常开发四大金刚

掌握这四个，前端 80% 的数据处理就够用了：

```typescript
obj[key as keyof typeof obj]   // 用字符串当键索引对象
arr.map(x => x.field)           // 提取字段
Object.entries(obj)             // 对象转 [k, v] 数组
{ ...obj, key: newValue }       // 不可变更新
```

---

## 速记

- 用字符串 key 索引对象 → 加 `as keyof typeof obj`
- 数组想被严格推断 → 用 `as const`
- 不确定 key 是否存在 → `filter(k => k in obj)` 或 `flatMap`
- 想要类型安全的工具函数 → 用泛型 `<T, K extends keyof T>`
