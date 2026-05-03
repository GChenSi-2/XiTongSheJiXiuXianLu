# 表头配置 + Tooltip 提示：商业项目的最佳实践

> 场景：表头需要显示文字，部分项还需要鼠标悬停时弹出 Tooltip 解释。
> 这是中后台、B 端项目里几乎必备的需求。

## 目录

- [反模式：分离的多个数据结构](#反模式分离的多个数据结构)
- [做法一：单一配置数组（最常见）](#做法一单一配置数组最常见)
- [做法二：抽成展示组件](#做法二抽成展示组件)
- [做法三：i18n 文案分离](#做法三i18n-文案分离)
- [做法四：后端驱动配置](#做法四后端驱动配置)
- [生产级完整骨架](#生产级完整骨架)
- [关键设计原则](#关键设计原则)
- [演进路径建议](#演进路径建议)

---

## 反模式：分离的多个数据结构

```tsx
// ❌ 不要这样写
const titlesArray = ["head1", "head2", "head3"];

const titlesObjects = {
  th1: { name: "head1", tip: true },
  th2: { name: "head2", tip: true },
  th3: { name: "head3", tip: false },
};

const help = {
  head1: "我是head1",
  head2: "我是head2",
};
```

**问题**：

1. **数据冗余**：`name` 在数组和对象里重复
2. **键不对齐**：`th1` vs `head1`，需要人脑映射或额外反查
3. **难维护**：加一个表头要改三个地方，容易漏改
4. **类型不安全**：字符串 key 容易打错，TS 推导不出来

---

## 做法一：单一配置数组（最常见）

把所有相关信息聚合到一个对象里，用数组保证顺序：

```tsx
type ColumnConfig = {
  key: string;          // 唯一标识
  label: string;        // 显示文字
  tooltip?: string;     // 可选：有就显示 Tooltip
};

const columns: ColumnConfig[] = [
  { key: "head1", label: "标题一", tooltip: "我是head1" },
  { key: "head2", label: "标题二", tooltip: "我是head2" },
  { key: "head3", label: "标题三" },  // 没有 tooltip 就不传
];

// 渲染
{columns.map(col => (
  <TableHeader key={col.key}>
    {col.tooltip ? (
      <Tooltip text={col.tooltip}>
        <span style={{ textDecoration: 'underline dotted', cursor: 'help' }}>
          {col.label}
        </span>
      </Tooltip>
    ) : (
      <span>{col.label}</span>
    )}
  </TableHeader>
))}
```

**为什么这是主流**：

- 一个表头 = 一个对象，所有信息聚合
- 加/删/改字段只动一个地方
- 用 `tooltip` 是否存在天然代替了 `tip: true/false`，少一个字段
- Ant Design、Element Plus、Material UI 的 Table columns API **就是这个设计**

---

## 做法二：抽成展示组件

把"带可选 tooltip 的文字"封装成可复用组件：

```tsx
// components/LabelWithTooltip.tsx
type Props = {
  label: string;
  tooltip?: string;
};

export function LabelWithTooltip({ label, tooltip }: Props) {
  if (!tooltip) return <span>{label}</span>;

  return (
    <Tooltip text={tooltip}>
      <span style={{ textDecoration: 'underline dotted', cursor: 'help' }}>
        {label}
      </span>
    </Tooltip>
  );
}

// 使用
{columns.map(col => (
  <LabelWithTooltip key={col.key} label={col.label} tooltip={col.tooltip} />
))}
```

**好处**：业务代码只关心数据，UI 细节封在组件里。下次要加图标、改样式，改组件一处即可。

---

## 做法三：i18n 文案分离

中大型项目里**文案绝对不会硬编码**，会走国际化方案：

```tsx
// locales/zh-CN.ts
export const messages = {
  table: {
    head1: { label: "标题一", tooltip: "我是head1" },
    head2: { label: "标题二", tooltip: "我是head2" },
    head3: { label: "标题三" },
  }
};

// 配置文件只留 key
const columnKeys = ["head1", "head2", "head3"] as const;

// 渲染
const { t } = useTranslation();

{columnKeys.map(key => (
  <LabelWithTooltip
    key={key}
    label={t(`table.${key}.label`)}
    tooltip={t(`table.${key}.tooltip`, { defaultValue: "" }) || undefined}
  />
))}
```

**真实项目就长这样**：

- `columnKeys` 控制顺序和显示哪些列
- 文案文件按语言切换（中/英/日）
- 业务代码只认 key，不认文字

---

## 做法四：后端驱动配置

字段配置由后端返回，前端只负责渲染：

```tsx
type ColumnFromAPI = {
  field: string;
  display_name: string;
  help_text?: string;
  sortable?: boolean;
  width?: number;
};

const { data: columns } = useQuery<ColumnFromAPI[]>('/api/table-columns');

{columns?.map(col => (
  <TableHeader key={col.field} width={col.width}>
    <LabelWithTooltip label={col.display_name} tooltip={col.help_text} />
  </TableHeader>
))}
```

**适用场景**：

- 中后台管理系统，列配置可能由管理员在后台动态调整
- 多租户产品，不同客户看到的字段不同
- 表头需要权限控制（某些列只有管理员能看）

---

## 生产级完整骨架

组合以上做法，一个真正可复用的 DataTable 大概长这样：

```tsx
// types.ts
type ColumnConfig<T> = {
  key: keyof T;
  labelKey: string;       // i18n key
  tooltipKey?: string;    // i18n key（可选）
  width?: number;
  render?: (value: T[keyof T], row: T) => ReactNode;
};

// config/userTableColumns.ts
export const userTableColumns: ColumnConfig<User>[] = [
  { key: "name",  labelKey: "user.name",  tooltipKey: "user.name.help" },
  { key: "email", labelKey: "user.email" },
  { key: "role",  labelKey: "user.role",  tooltipKey: "user.role.help" },
];

// components/DataTable.tsx
function DataTable<T>({ columns, data }: { columns: ColumnConfig<T>[]; data: T[] }) {
  const { t } = useTranslation();

  return (
    <table>
      <thead>
        <tr>
          {columns.map(col => (
            <th key={String(col.key)} style={{ width: col.width }}>
              <LabelWithTooltip
                label={t(col.labelKey)}
                tooltip={col.tooltipKey ? t(col.tooltipKey) : undefined}
              />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i}>
            {columns.map(col => (
              <td key={String(col.key)}>
                {col.render ? col.render(row[col.key], row) : String(row[col.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 使用
<DataTable columns={userTableColumns} data={users} />
```

---

## 关键设计原则

| 原则 | 解释 |
|------|------|
| **单一数据源** | 一个东西的所有属性放一起，不要散落在多个变量里 |
| **数组管顺序，对象管属性** | 数组天然有序，对象适合做属性容器 |
| **可选优于布尔标志** | `tooltip?: string` 比 `tip: boolean + tooltipText: string` 更简洁 |
| **文案与代码分离** | i18n、常量文件、后端返回，三选一 |
| **UI 封装成组件** | 业务代码只传数据，不写样式细节 |
| **类型驱动** | 用 TS 类型约束配置结构，IDE 自动补全 |

---

## 演进路径建议

**不要一开始就过度设计**，按项目规模逐步演进：

```
小项目 / Demo
   ↓ 把数据聚合
做法一（单一配置数组）
   ↓ UI 复用增多
做法二（抽展示组件）
   ↓ 需要多语言
做法三（i18n 分离）
   ↓ 需要动态配置 / 多租户
做法四（后端驱动）
   ↓ 多个表格场景
生产级骨架（泛型 DataTable）
```

### 最小改动升级示例

从反模式到做法一只需要 3 行配置：

```tsx
// 改造前：3 个数据结构 + 复杂的反查逻辑

// 改造后：
const columns = [
  { key: "head1", label: "head1", tooltip: "我是head1" },
  { key: "head2", label: "head2", tooltip: "我是head2" },
  { key: "head3", label: "head3" },
];

{columns.map(col => (
  <LabelWithTooltip key={col.key} label={col.label} tooltip={col.tooltip} />
))}
```

可读性、可维护性、类型安全全部上来了。

---

## 速记

- 多个分离的数据结构 → 合并成单一配置数组
- 重复的 UI 模式 → 抽展示组件
- 硬编码文案 → i18n 抽离
- 静态配置不够 → 后端驱动
- 多场景复用 → 泛型组件 + 类型约束
