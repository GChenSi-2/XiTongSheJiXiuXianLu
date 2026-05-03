# 设计系统落地实践笔记

> 主题：以 Carbon Design System 为例，理解设计系统的特点，并在自己的项目中工程化落地

---

## 一、Carbon Design System 的特点

IBM 开源的设计系统，定位于**企业级（B2B）**产品，尤其是数据密集、流程复杂的工作场景。

### 设计哲学

- **以人为本的企业设计**：在严肃专业的基调下追求清晰和效率
- 不追求视觉惊艳，让用户在长时间高强度使用中保持低认知负荷
- 与面向消费者的 Material Design 形成明显对比

### 视觉语言

| 维度 | 特点 |
| --- | --- |
| 字体 | IBM Plex 家族（Sans / Mono / Serif），几何感强但不冰冷 |
| 主色 | IBM Blue `#0f62fe`，灰阶层次极丰富（Gray 10 → Gray 100） |
| 边角 | 直角为主，圆角极少，强化"工程化"印象 |
| 栅格 | 2x Grid 系统，所有间距/尺寸都是 2 的倍数 |

### 组件库取向

- 偏向**数据展示和操作密集型**：DataTable、Tile、Notification、ProgressIndicator、Form 元素做得非常细致
- 营销页常用的炫酷动效组件较少
- 组件 API 严谨，可定制性强但学习曲线略陡

### 多框架支持

官方维护 React、Vue、Angular、Web Components 多个实现版本（React 最完整）。这在设计系统里比较少见。

### 主题系统

内置 **White / Gray 10 / Gray 90 / Gray 100** 四套官方主题，深浅色切换原生支持。Token 系统规范，便于品牌定制。

### 适用场景

✅ 后台管理系统、数据分析平台、SaaS 工具、监控仪表盘
❌ 消费级 App、营销官网、强调情感化设计的产品

---

## 二、落地设计系统的七步流程

### Step 1 — 评估与选型确认

确认三件事：

- **技术栈匹配度**（框架原生支持？）
- **组件覆盖度**（核心组件是否齐全，缺多少）
- **定制能力**（Token 系统、主题机制能否承载品牌）

同时确认许可证和长期维护状况（GitHub star 趋势、issue 响应、最近 release）。**这一步走错，后面所有工作都是沉没成本。**

### Step 2 — 搭建技术基座

- 安装核心包和样式依赖
- 配置构建工具（Sass loader、PostCSS、Tree-shaking）
- 引入字体
- 先做一个最小可运行 Demo 验证

### Step 3 — 定义设计 Token 层 ⭐

**最关键、最容易被跳过的一步。**

不要直接用原始 Token：

```scss
// ❌ 不要
.card { padding: $spacing-05; background: $blue-60; }

// ✅ 推荐
.card { padding: var(--spacing-card-padding); background: var(--color-primary); }
```

中间建一层语义化的项目 Token，未来升级、换主题、甚至换设计系统，只需要改这一层。

### Step 4 — 建立组件封装层 ⭐

业务代码绝不直接 import 第三方组件库：

```tsx
// ❌ 不要
import { Button } from '@carbon/react';

// ✅ 推荐
import { Button } from '@/components/ui';
```

封装层好处：

- 统一组件 API（升级时 breaking change 只改这一层）
- 隔离第三方依赖
- 方便插入埋点和无障碍增强

### Step 5 — 制定规范与文档

把决策写下来：

- "什么时候用 Button 还是 Link"
- "什么场景用 Modal 还是 Drawer"
- "表单错误提示的统一写法"

用 **Storybook** 作为活文档：封装组件 + 使用示例 + 反例。

### Step 6 — 处理缺失组件与定制需求

优先级：

1. 现有组件**组合**实现
2. 通过 Token 或 props **小改**
3. 必须**自建**时，遵循设计系统的设计语言

最忌讳：引入风格完全不同的第三方组件，导致界面割裂。

### Step 7 — 建立升级与维护机制

- 锁定到 minor 版本（`^11.40.0` 而不是 `*`）
- 订阅 release notes
- 定期评估升级（如每季度）
- 升级时先在封装层适配，再批量验证业务页面

### 常见的坑

- ❌ 绕过封装层直接用原始组件
- ❌ 过度定制，把设计系统改得面目全非
- ❌ 只关注组件而忽略 Token 和栅格
- ❌ 设计稿和代码版本不同步（设计师 v11，前端 v9）

---

## 三、Carbon + React 脚手架实践

### 项目结构

```
carbon-react-scaffold/
├── package.json              # @carbon/react + Vite + TS
├── vite.config.ts            # Sass loadPaths 指向 node_modules
├── tsconfig.json             # 路径别名 @/* → src/*
├── eslint.config.js          # 🔒 禁止业务代码直接 import @carbon/react
├── .storybook/               # 组件文档配置
└── src/
    ├── tokens/
    │   ├── _semantic.scss    # 🎯 语义 Token 层（核心）
    │   └── index.ts          # Token 的 TS 镜像
    ├── styles/global.scss    # Carbon 样式按需引入入口
    ├── theme/
    │   └── ThemeProvider.tsx # 深浅色主题切换
    ├── components/ui/        # 🛡️ 组件封装层
    │   ├── Button/           # 收窄 kind、补 loading、加埋点
    │   ├── Card/             # 自建（Carbon 没有 Card）
    │   ├── FormField/        # 统一表单字段结构
    │   ├── PageLayout/       # 标准页面骨架
    │   └── index.ts          # 业务统一从这里 import
    ├── App.tsx               # 示例页面
    └── main.tsx
```

### 三道防线

整套架构的灵魂。**单独做任何一件都没用，必须四件事一起做**才能真正沉淀。

#### 防线 1：Token 层（`src/tokens/_semantic.scss`）

把 Carbon 原始 Token 映射成业务语义 Token：

```scss
:root {
  // 颜色：业务语义
  --color-primary: #{carbon-theme.$button-primary};
  --color-text-primary: #{carbon-theme.$text-primary};
  --color-bg-layer-1: #{carbon-theme.$layer-01};

  // 间距：业务语义
  --spacing-card-padding: var(--spacing-md);
  --spacing-section-gap: var(--spacing-lg);
  --spacing-form-field-gap: var(--spacing-md);
}
```

同时提供 TS 镜像供 inline style 使用：

```ts
export const tokens = {
  color: { primary: 'var(--color-primary)', /* ... */ },
  spacing: { cardPadding: 'var(--spacing-card-padding)', /* ... */ },
};
```

#### 防线 2：组件封装层（`src/components/ui/`）

每个封装组件做的事：

| 封装动作 | 例子 |
| --- | --- |
| **收窄 API** | Carbon Button 8 种 kind → 业务只允许 4 种 |
| **调整默认值** | Carbon `size="lg"` → 改为 `size="md"` |
| **补充缺失功能** | Carbon Button 没有 loading 态 → 用 `InlineLoading` 模拟 |
| **预留埋点钩子** | 所有按钮自动支持 `trackingId` prop |
| **简化 API** | Carbon 啰嗦的 `labelText/invalid/invalidText` → 直觉的 `label/error` |

Button 封装核心代码示例：

```tsx
type ButtonKind = 'primary' | 'secondary' | 'tertiary' | 'danger';
// Carbon 原生 8 种 → 业务收窄到 4 种

export interface ButtonProps extends Omit<CarbonButtonProps, 'kind'> {
  kind?: ButtonKind;
  loading?: boolean;
  loadingText?: string;
  trackingId?: string;
}
```

#### 防线 3：ESLint 强制约束（`eslint.config.js`）

```js
'no-restricted-imports': ['error', {
  paths: [{
    name: '@carbon/react',
    message: '业务代码请勿直接引用 @carbon/react，请从 @/components/ui 引用',
  }],
}]
```

排除封装层自身（`src/components/ui/**`），只有它能 import Carbon。**没有这条规则，前两道防线很快就会被新人不经意地绕过。**

### 主题切换实现

通过给根元素加 `data-carbon-theme` 属性切换：

```tsx
// ThemeProvider.tsx
useEffect(() => {
  document.documentElement.setAttribute('data-carbon-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
}, [theme]);
```

四套可选主题：

| 主题 | 类型 | 用途 |
| --- | --- | --- |
| `white` | 浅色 | 默认 |
| `g10` | 浅灰 | 信息密集页面，降低眩光 |
| `g90` | 深灰 | 深色模式 |
| `g100` | 纯深 | 高对比度，监控大屏 |

---

## 四、添加新组件的标准流程

以新增 `DataTable` 为例：

1. **判断**：Carbon 是否有原生组件？
   - 有 → 在 `ui/DataTable/` 下创建封装
   - 无 → 自建，但严格使用语义 Token

2. **创建文件结构**：

   ```
   src/components/ui/DataTable/
   ├── DataTable.tsx
   ├── DataTable.scss
   ├── DataTable.stories.tsx
   └── index.ts
   ```

3. **追加导出**：在 `src/components/ui/index.ts` 中导出

4. **写 Storybook 故事**：常用场景 + 边界 case + 反例

5. **更新文档**

---

## 五、Carbon 升级标准流程

1. 阅读 release notes
2. feature branch 上升级版本
3. `npm run build` + `npm run storybook` 定位 breaking change
4. **只在 `src/components/ui/` 和 `src/tokens/` 内做适配**
5. 业务页面通常无需改动
6. 全量回归 Storybook
7. 合并

---

## 六、核心要点回顾

> 落地设计系统本质上是**工程治理问题**，不是技术问题。

- 前期多花 1-2 周搭好 Token 层和封装层，后面能省下几个月返工
- 封装层代码量不大（每组件几十行），但**战略价值极高**
- 封装层的价值不在功能扩展，而在 **隔离变化**
- 今天满足需求 ≠ 明年也满足，所以即使设计系统已经够用，也需要封装层
- ESLint 规则是**纪律的边界**，缺了它前两道防线会逐渐失效

### 这套模式的通用性

Carbon 只是载体，把 `@carbon/react` 替换成 Ant Design / Material UI / 公司内部系统，这套**Token 层 + 封装层 + 强制约束**的模式同样适用。

---

## 七、可继续深化的方向

- 补 Modal / Toast / DataTable 等高频组件
- 接入 Figma Token 同步（Tokens Studio + Style Dictionary）让设计稿和代码共享同一份 Token
- 加上视觉回归测试（Chromatic / Percy）
- 国际化（i18n）方案统一封装在 ui 层
- 表单方案选型（react-hook-form + 封装层组件适配）
