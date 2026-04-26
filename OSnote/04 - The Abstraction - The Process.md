---
tags: [OS, process, abstraction, virtualization]
source: cpu-intro.pdf
chapter: 4
title: "The Abstraction: The Process"
---

# 第 4 章 The Abstraction：Process（进程抽象）

> **核心问题（CRUX）**：物理 CPU 数量有限（通常只有几个），OS 要如何营造出「有几乎无限多个 CPU」的假象？

答：**虚拟化 CPU（virtualizing the CPU）**——通过 **time sharing**（分时），让 OS 跑一会儿 A、停下、跑一会儿 B……轮流切换，让用户感觉多个程序同时在跑。
- 代价：每个程序会变慢（CPU 被分掉）。
- 对偶概念：**space sharing**（空间共享），如磁盘空间一旦被分配给某文件就不会再分给别人。

---

## 机制 vs. 策略（Mechanism vs. Policy）

实现虚拟化需要两个层次的东西：

| 类别                | 回答的问题        | 举例                                               |
| ----------------- | ------------ | ------------------------------------------------ |
| **Mechanism（机制）** | *How?* 怎么做   | **Context switch**：如何停掉一个程序、切到另一个                |
| **Policy（策略）**    | *Which?* 选哪个 | **Scheduling policy**：现在该跑哪个程序（根据历史、工作负载、性能目标决定） |

> 💡 **设计原则**：分离 policy 与 mechanism，方便改策略而不动机制（模块化）。

---

## 4.1 Process 的抽象

**Process = 一个正在执行的程序（running program）**。程序本身躺在磁盘上只是死的字节；OS 把它加载、让它跑起来，才成为进程。

要理解一个进程，就要看它的 **machine state**（机器状态）——程序执行时可以读/写的东西：

| 组成                                   | 说明               |
| ------------------------------------ | ---------------- |
| **Memory（address space）**            | 指令、数据都住在这里       |
| **Registers（寄存器）**                   | 许多指令会直接读写寄存器     |
| ├─ **Program Counter (PC) / IP**     | 指向「下一条要执行的指令」    |
| ├─ **Stack Pointer / Frame Pointer** | 管理函数参数、局部变量、返回地址 |
| **I/O 信息**                           | 例如当前打开的文件列表      |

---

## 4.2 Process API（进程接口）

任何现代 OS 都要提供这些功能：

- **Create**：创建新进程（shell 输指令、双击图标都会触发）
- **Destroy**：强制杀掉失控进程
- **Wait**：等某个进程结束
- **Miscellaneous Control**：如暂停（suspend）、恢复（resume）
- **Status**：查询状态、执行时间等信息

> 详细 UNIX API（`fork`/`exec`/`wait`）见 [[05 - Process API (fork, exec, wait)]]。

---

## 4.3 Process 的创建流程

OS 把「程序」变成「进程」的步骤：

1. **Load 程序**：把 code 和 static data 从磁盘（或 SSD）的 executable 格式读进内存的 address space。
   - **Eager loading**（早期/简单 OS）：执行前一次性全部加载。
   - **Lazy loading**（现代 OS）：用到才加载（需配合 **paging / swapping**，见内存虚拟化章节）。
2. **分配 Stack**：用于局部变量、函数参数、返回地址；并初始化 `argc`、`argv` 给 `main()`。
3. **分配 Heap**：给 `malloc()` / `free()` 用的动态内存（链表、哈希表等）。一开始很小，不够再向 OS 要。
4. **I/O 初始化**：例如 UNIX 默认打开三个 file descriptor：`stdin`、`stdout`、`stderr`。
5. **跳到 entry point（`main()`）**：通过特殊机制把 CPU 控制权交给该进程，程序正式开始执行。

![[attachments/process-loading.png]]
*（示意：Disk 上的 program → Memory 中的 process，内含 code / static data / heap / stack）*

---

## 4.4 Process 的状态（Process States）

三种基本状态：

- **Running**：正在 CPU 上执行指令。
- **Ready**：随时可以执行，但 OS 暂时没选它。
- **Blocked**：做了某件事（如发起 I/O）暂时跑不动，要等事件发生才能回来。

### 状态转换图

```
          Descheduled
    ┌─────────────────┐
    │                 ▼
 [Running]  ←──  [Ready]
    │   Scheduled      ▲
    │                  │
    │ I/O: initiate    │ I/O: done
    ▼                  │
 [Blocked] ─────────────┘
```

- Ready → Running：被 **scheduled**
- Running → Ready：被 **descheduled**
- Running → Blocked：发起 I/O
- Blocked → Ready：I/O 完成

### 示例追踪

**只用 CPU（无 I/O）**：P0 跑完才换 P1。

**有 I/O 的情况**：

| Time | P0 | P1 | 备注 |
|------|----|----|------|
| 1–3 | Running | Ready | P0 跑一阵后发起 I/O |
| 4–6 | Blocked | Running | P0 等 I/O，让 P1 上 |
| 7 | Ready | Running | I/O 完成 |
| 8 | Ready | Running | P1 完成 |
| 9–10 | Running | – | P0 继续跑完 |

> 🤔 OS 的两个决策：(1) P0 发 I/O 时切到 P1（提高 CPU 利用率）；(2) I/O 完成时不马上切回 P0（是否明智？交由 **scheduler** 决定，见后面章节）。

---

## 4.5 关键数据结构（Data Structures）

OS 本身也是程序，会用数据结构追踪所有进程：

- **Process list / task list**：所有进程的清单。
- **PCB（Process Control Block）/ Process Descriptor**：每个进程的一条结构，存所有相关信息。

### xv6 的 `struct proc`（精简版）

```c
struct context {       // context switch 时保存/恢复的寄存器
    int eip, esp, ebx, ecx, edx, esi, edi, ebp;
};

enum proc_state {
    UNUSED, EMBRYO, SLEEPING, RUNNABLE, RUNNING, ZOMBIE
};

struct proc {
    char *mem;                // 进程内存起点
    uint  sz;                 // 内存大小
    char *kstack;             // kernel stack 底部
    enum proc_state state;    // 进程状态
    int   pid;                // 进程 ID
    struct proc *parent;      // 父进程
    void *chan;               // sleep 在哪个 channel 上
    int   killed;             // 是否已被 kill
    struct file *ofile[NOFILE]; // 打开的文件
    struct inode *cwd;          // 当前目录
    struct context context;     // 切回来时要恢复的 register context
    struct trapframe *tf;       // 中断时的 trap frame
};
```

### 除了 Running / Ready / Blocked 以外的状态

- **Initial（EMBRYO）**：进程刚创建、还没准备好执行。
- **Final / Zombie（ZOMBIE）**：进程已结束，但 PCB 还没被清掉。
  - 父进程可用 `wait()` 读取子进程的 **返回码**（UNIX 惯例：0 = 成功，非 0 = 失败）。
  - `wait()` 也告诉 OS 可以回收相关数据结构。

> 💡 **Register Context** 的用途：当进程被停下，寄存器内容存到 PCB；要恢复执行时再把值放回物理寄存器。这就是 **context switch** 的核心（详见后续章节）。

---

## 4.6 小结（重点口诀）

- **Process = running program**，由 address space + registers（PC, SP…）+ I/O 信息 描述。
- OS 用 **time sharing + context switch** 虚拟化 CPU。
- 设计采用 **mechanism / policy 分离**。
- Process 三大状态：**Running / Ready / Blocked**，加上 **Initial** 与 **Zombie（final）**。
- 每个进程由 **PCB** 记录，放进 **process list**。
- 接下来要学：低层 **mechanism**（context switch 等）+ 高层 **policy**（scheduling）。

---

## 关键术语（Key Terms）

| 术语 | 中文 / 含义 |
|------|-----------|
| Process | 进程；正在执行的程序 |
| Virtualizing the CPU | CPU 虚拟化 |
| Time sharing / Space sharing | 分时共享 / 空间共享 |
| Mechanism / Policy | 机制 / 策略 |
| Context switch | 上下文切换 |
| Address space | 地址空间 |
| Program counter (PC / IP) | 程序计数器 |
| Stack / Heap | 栈 / 堆 |
| File descriptor | 文件描述符 |
| PCB (Process Control Block) | 进程控制块 |
| Zombie state | 僵尸状态 |
| Scheduler | 调度器 |

---

## Homework 重点提示（process-run.py）

模拟器可视化进程状态变化。几个关键 flag：

- `-l a:b,c:d`：指定进程（a 条指令，b% 概率是 CPU / (100-b)% 是 I/O）。
- `-S SWITCH_ON_END`：I/O 时**不**切换（浪费 CPU）。
- `-S SWITCH_ON_IO`：I/O 时**切**到其他进程（提高利用率）。
- `-I IO_RUN_LATER`：I/O 完成后不马上跑原进程，让当前的继续。
- `-I IO_RUN_IMMEDIATE`：I/O 完成立刻跑回原进程（通常更好，因为它可能马上又要 I/O，能重叠更多 I/O 与 CPU）。

> 观察重点：**CPU 利用率** 在不同 policy 下的差异——这正是 **mechanism 相同、policy 不同** 带来的效果。

[[cpu-intro.pdf]]