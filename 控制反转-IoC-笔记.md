# 控制反转(IoC):从 Spring 到 React 的统一视角

> 控制反转不是某个框架的特性,而是一种**通用的软件设计原则**。本笔记从原理出发,把 Spring 的依赖注入和 React 的 render props 放在同一个框架下理解,揭示它们其实是同一种思想的不同投影。

---

## 一、什么是"控制"?什么叫"反转"?

### 1.1 正向控制:我自己拿

```java
class OrderService {
    private MySQLDatabase db = new MySQLDatabase();  // 我自己 new
    
    void saveOrder(Order order) {
        db.insert(order);
    }
}
```

`OrderService` 自己掌握着两个控制权:

1. **依赖什么**: 我用 `MySQLDatabase`,不用别的
2. **何时创建**: 我在字段初始化时 new 出来

这叫**正向控制**——"我需要什么,我自己拿"。

### 1.2 控制反转:别人给我

```java
class OrderService {
    private final Database db;
    
    public OrderService(Database db) {  // 不自己 new,等别人给
        this.db = db;
    }
}
```

`OrderService` 不再决定"用什么数据库",也不再决定"何时创建数据库实例"。它只是说:"**给我一个 Database 就行**"。

控制权被**反转**了——从"自己拿"变成"别人给"。这就是 IoC 的字面含义。

---

## 二、IoC 的本质:权力转移

IoC 不是某种具体技术,而是一种**权力转移**。任何时候出现这种结构,你都能称之为 IoC:

| 维度 | 正向控制 | 控制反转 |
|---|---|---|
| 谁创建依赖 | 自己 new | 别人传进来 |
| 谁决定时机 | 自己写好流程 | 框架在合适时机调用我 |
| 谁知道全貌 | 自己 | 框架/调度者 |
| 我的角色 | 主动方 | 被动方(被调用) |

### 好莱坞原则(Hollywood Principle)

IoC 有一句经典的表述:

> **"Don't call us, we'll call you."**
> (别给我们打电话,我们会给你打电话。)

这就是 IoC 的精神:**你别主动调用框架,框架在合适时机调用你**。

---

## 三、Spring 的 IoC:对象创建的控制反转

Spring 的 IoC 主要解决"**对象之间的依赖关系谁来管理**"的问题。

### 3.1 没有 IoC 时的样子

```java
class OrderController {
    private OrderService service = new OrderService(
        new MySQLOrderRepository(
            new HikariDataSource(/* 一堆配置 */)
        )
    );
}
```

每个类都要知道下游的所有细节,创建链像俄罗斯套娃。后果:

- 改个数据库实现,所有上游都要改
- 测试时无法替换成 mock
- 配置散落各处

### 3.2 Spring 的解法:容器接管创建

```java
@Service
class OrderService {
    private final OrderRepository repo;
    
    public OrderService(OrderRepository repo) {  // 我只声明依赖
        this.repo = repo;
    }
}

@Repository
class MySQLOrderRepository implements OrderRepository { ... }
```

发生了什么:

1. `OrderService` 不再自己 new repository,只是**声明**"我需要一个 `OrderRepository`"
2. Spring 容器在启动时扫描所有 `@Service`、`@Repository`,建立"依赖图谱"
3. 容器**反过来调用** `OrderService` 的构造函数,把 repository 实例**注入**进去

控制权的转移:

| 项目 | 反转前 | 反转后 |
|---|---|---|
| 谁创建 OrderRepository | OrderService 自己 | Spring 容器 |
| 谁决定具体实现 | 代码硬编码 | 配置 / `@Profile` / 条件装配 |
| 谁决定生命周期 | 跟着 OrderService 走 | 容器决定(单例/原型/请求作用域) |
| OrderService 的角色 | 主动创建者 | 被动接收者 |

### 3.3 Spring 全家桶里到处都是 IoC

不止 `@Autowired`,以下都遵循"Don't call us, we'll call you":

- **`@RestController` + `@GetMapping`**: 你不调用 HTTP 框架,框架在收到请求时调用你
- **`@EventListener`**: 你不轮询事件,事件发生时框架调用你
- **`@Scheduled`**: 你不写定时循环,调度器到点调用你
- **`@Transactional`**: 你不管理事务边界,AOP 在方法前后调用事务管理器

---

## 四、React 的 IoC:渲染时机的控制反转

React 的 IoC 主要解决"**组件之间渲染的协作关系谁来管理**"。

### 4.1 普通 children:静态成品,无 IoC

```tsx
<Tooltip>
  <button onClick={() => alert('我关不掉 tooltip')}>关闭</button>
</Tooltip>
```

这里没有控制反转——调用方提供了一个**完全决定好的成品**,Tooltip 只能原样渲染它。`button` 想关闭 tooltip 也没办法,因为它**够不到** tooltip 的内部状态。

### 4.2 render prop:配方 + 注入,典型 IoC

```tsx
<Tooltip popup={({ close }) => 
  <button onClick={close}>我能真正关闭</button>
} />
```

控制权的转移:

| 项目 | 反转前(静态 children) | 反转后(render prop) |
|---|---|---|
| 谁提供 `close` 函数 | 调用方自己想办法(做不到) | Tooltip 内部 |
| 谁决定何时渲染 popup | 调用方写在 JSX 里就立刻渲染 | Tooltip 决定何时调用函数 |
| 谁决定渲染什么 | 调用方完全决定 | 调用方提供模板,Tooltip 注入数据 |
| 调用方的角色 | 主动构造 ReactNode | 被动地等 Tooltip 调用我的函数 |

注意第三行:控制权不是简单的"全部翻转",而是**分工**——Tooltip 控制"何时渲染、用什么数据",调用方控制"长什么样"。

### 4.3 React 里其他的 IoC 体现

- **`useEffect(() => {...})`**: 你不调用副作用,React 在合适时机调用你的函数
- **`useState` 的 setter 接受函数**: `setCount(c => c + 1)`,React 在合适时机调用你
- **Context Provider/Consumer**: 你不主动取值,React 在子树渲染时把值注入给你
- **事件处理器**: `onClick={handler}`,你不轮询点击,DOM 在被点击时调用你
- **Suspense / ErrorBoundary**: 子组件抛出 promise/error,React 决定如何呈现 fallback

> React **整个编程模型本身就是 IoC 的**: 你写"应该长什么样",React 决定"何时渲染、如何 diff、何时挂载"。这跟命令式 DOM 操作(`document.createElement` 那一套)正好相反。

---

## 五、Spring 和 React 的横向对照

把两个世界放在同一张表里:

| 维度 | Spring IoC | React IoC(render prop 视角) |
|---|---|---|
| **解决什么问题** | 对象依赖关系管理 | 组件协作关系管理 |
| **被反转的控制** | 对象创建权 | 渲染时机 + 数据注入 |
| **谁是"调度者"** | Spring 容器(`ApplicationContext`) | 父组件(Tooltip) |
| **谁是"被调用者"** | 你的业务类(OrderService) | 调用方传入的函数 |
| **依赖关系如何声明** | 构造函数参数 / `@Autowired` 字段 | 函数形参(`{ close, visible }`) |
| **依赖关系何时建立** | 容器启动时扫描装配 | 父组件运行时调用函数 |
| **典型代码标志** | `@Service`、构造函数注入 | `(args) => ReactNode` 类型的 prop |

最关键的对应:

```
Spring 的 OrderService(OrderRepository repo)
        ≈
React 的 popup={({ close }) => ...}
```

两者都是**"我声明我需要什么,等你给我"**——只是一个等的是对象,一个等的是函数参数。

---

## 六、更深一层:依赖倒置原则(DIP)

IoC 还有一个更精妙的方面——**依赖倒置原则**。这是 SOLID 五原则中的 D。

### 6.1 反转前:高层依赖低层细节

```
OrderController → OrderService → MySQLRepository
   (高层)          (中层)         (底层细节)
```

高层模块依赖低层细节。后果:数据库一换,上游全得改。

### 6.2 反转后:都依赖抽象

```
OrderController → OrderService → OrderRepository (接口)
                                      ↑
                              MySQLRepository (实现)
```

现在 `OrderService` 只知道 `OrderRepository` 接口,不知道具体实现。具体用哪个实现,由容器/配置决定。

**依赖的方向被"倒置"了**——底层细节反过来要满足上层定义的接口。

### 6.3 React 里同样的模式

看 render prop 的类型签名:

```tsx
type TooltipProps = {
  popup: (args: { close: () => void; visible: boolean }) => ReactNode;
};
```

`Tooltip` 定义了一个"接口"(参数对象的形状)——**调用方必须满足这个接口**(写一个能接受这种参数的函数)。`Tooltip` 不知道调用方具体会渲染什么,调用方也不能要求 `Tooltip` 提供别的参数。

这跟 Spring 的接口注入是**同一种思维**:双方都向"约定的接口"靠拢,而不是直接互相依赖。

---

## 七、IoC 无处不在

理解原理后,你会发现 IoC 在软件世界中**无处不在**:

| 场景 | "我"的代码 | "调度者" |
|---|---|---|
| Web 框架(Spring MVC、Express、FastAPI) | 路由处理函数 | HTTP 服务器 |
| GUI 框架(Swing、Qt、Win32) | 事件回调 | 事件循环 |
| Node.js 异步 | `.then()` 回调、`async` 函数 | 事件循环 |
| 数据库 ORM | 实体类 + 注解 | ORM 引擎(Hibernate、Prisma) |
| 测试框架(JUnit、Jest) | `@Test` / `it()` 里的函数 | 测试 runner |
| React 组件 | 你的函数组件 | React 协调器 |
| Redux 中间件 | reducer / middleware | store |
| AOP / 装饰器 | 被装饰的方法 | 装饰器/代理 |

凡是"**框架来调你,不是你调框架**"的地方,都有 IoC 的影子。这引出一个重要区分:

> **库(library)是你调用的代码,框架(framework)是调用你的代码。**

框架天然就是 IoC 的化身。

---

## 八、IoC 带来什么好处?

### 8.1 解耦(Decoupling)

调用方和被调用方不再直接绑定,中间隔了一层"约定"(接口/参数签名)。

- Spring: 换数据库不影响 Service
- React: 换浮层样式不影响 Tooltip 内部逻辑

### 8.2 可测试性(Testability)

依赖可以被替换成 mock。

```java
// 测试时:
new OrderService(new FakeRepository());  // 注入假的
```

```tsx
// 测试时:
<Tooltip popup={() => <div>测试用浮层</div>} />
```

### 8.3 可扩展性(Extensibility)

调用方可以给出任意实现,只要满足接口/签名。

- Spring: 新加一种存储后端,实现 `OrderRepository` 即可
- React: 新加一种浮层样式,写一个新函数即可

### 8.4 关注点分离(Separation of Concerns)

每一方只管自己那部分,不操心别人的事。

- `OrderService` 不操心数据库怎么连
- `Tooltip` 不操心浮层长什么样,调用方不操心 hover 状态怎么管

---

## 九、IoC 的代价

公平起见,任何抽象都不是免费的:

| 代价 | Spring 的体现 | React 的体现 |
|---|---|---|
| **追踪困难** | 看代码不知道注入的实际是谁 | render prop 嵌套深时心智负担大 |
| **调试链路长** | 一次请求经过 N 层代理/拦截器 | 状态从父组件流到 render prop 函数,链路长 |
| **学习曲线** | 要理解容器生命周期、Bean 作用域 | 要理解函数定义/调用时机、闭包 |
| **过度设计风险** | 每个东西都做接口 + 实现 | 简单场景也用 render prop,API 复杂 |

实际工程中,**简单场景不需要 IoC**。Spring 不是要求你给所有类都做接口,React 也不是说所有 prop 都该是函数。

**判断标准**: 这里是否真的需要"调用方决定一部分,调度者决定一部分"的协作?

---

## 十、跨语言/跨框架对照表

把更多技术放在一起对比,会发现"控制反转"这件事的普适性:

| 技术栈 | "声明依赖"的写法 | "注入依赖"的方式 |
|---|---|---|
| Spring (Java) | 构造函数参数 / `@Autowired` | 容器扫描 + 反射 |
| FastAPI (Python) | `def handler(db: DB = Depends(get_db))` | 框架解析签名,调用 `get_db` |
| Angular (TypeScript) | 构造函数参数 + 装饰器 | 注入器(Injector)解析 |
| Rust (Axum) | extractor: `async fn handler(State(db): State<DB>)` | 框架根据类型实现自动提取 |
| React render prop | `popup: ({ close }) => ReactNode` | 父组件运行时调用函数 |
| React Hooks | `const value = useContext(Ctx)` | React 在渲染时根据组件位置查找 Provider |
| JUnit 5 | `@Test void test(MyParam p)` | 框架根据 `ParameterResolver` 注入 |

**所有这些写法的共性**: 我**声明**我要什么,框架/容器/父组件**提供**给我。

---

## 十一、心法总结

1. **IoC 不是框架特性,是设计原则**——任何"框架调你而不是你调框架"的地方都是它
2. **核心是权力转移**——谁决定创建/调用/时机,这个权力被反转了
3. **Hollywood 原则**: "Don't call us, we'll call you"
4. **Spring 反转的是对象创建权**,React render prop 反转的是渲染时机和数据注入
5. **依赖的不是实现,是契约**——这是 IoC 的更深一层(DIP)
6. **库 vs 框架的本质区别**: 库被你调用,框架反过来调用你
7. **代价存在**——别为了 IoC 而 IoC,简单场景直接耦合反而清晰

---

## 十二、一句话连接两个世界

> **Spring 让你声明"我需要一个 Repository",容器在运行时把它注入给你;React render prop 让你声明"如果给我 close 我会这样用",父组件在渲染时把它注入给你。两者都是同一种思想的不同投影:你描述需求,框架/父组件提供实现——这就是控制反转。**

---

## 十三、扩展阅读方向

- **SOLID 原则中的 DIP(依赖倒置原则)**: IoC 的理论基础
- **Service Locator 模式 vs Dependency Injection**: IoC 的两种实现路线对比
- **Aspect-Oriented Programming(AOP)**: 用 IoC 实现横切关注点(日志、事务、权限)
- **Reactive Programming**: 数据流的控制反转(RxJS、Reactor)
- **Effect Systems**: 把"做什么"和"何时做"彻底分离的更激进抽象(Haskell IO、Algebraic Effects)
- **Hooks 如何取代 render props**: React 现代化下 IoC 表达方式的演进
