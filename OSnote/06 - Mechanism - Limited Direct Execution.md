---
tags: [OS, cpu, virtualization, kernel, trap, context-switch]
source: cpu-mechanisms.pdf
chapter: 6
title: "Mechanism: Limited Direct Execution"
---

## 第 6 章 机制：受限直接执行（Limited Direct Execution, LDE）

> **核心问题（CRUX）**：OS 如何 **高效地** 虚拟化 CPU，同时又 **保有控制权**？
> 这两个目标常相互拉扯 → 必须 **硬件 + OS 合作**。

CPU 虚拟化的基本做法：**时间分享（time sharing）**——跑一会 A、跑一会 B、轮流来。
实作上要解决两个子问题：
1. **受限操作**：怎么不让用户程序为所欲为？
2. **切换进程**：OS 没在 CPU 上跑的时候，怎么夺回控制权？

---

### 6.1 基本技术：Limited Direct Execution

**Direct Execution（直接执行）** 就是把程序直接丢到 CPU 上跑，自然最快。

OS 启动一个程序的基本流程（**尚无限制**）：
1. 在 process list 建立条目
2. 分配内存、把程序加载进来
3. 设置 stack（argc/argv）、清空寄存器
4. `call main()` → 程序开始跑
5. 程序 `return` → OS 回收资源

问题来了：
- 程序若发出 I/O、访问非法内存怎么办？
- OS 怎么把它从 CPU 上拉下来、换别的程序跑？

→ 这就是 "**Limited**" 的由来：要给直接执行加上 **限制** 与 **安全闸门**。

---

### 6.2 问题一：受限操作（Restricted Operations）

#### 两种执行模式

| 模式 | 权限 | 谁在用 |
|------|------|--------|
| **User mode** | 受限，不能执行特权指令（如 I/O） | 普通程序 |
| **Kernel mode** | 全权限，可执行任何指令 | OS / kernel |

User mode 若尝试做特权操作 → 硬件抛异常 → OS 通常直接把它杀掉。

#### System Call（系统调用）

用户程序若要执行特权操作（读文件、创建进程、分配内存……），必须通过 **system call** 向 kernel 请求：

1. 用户调用 libc 函数（如 `open()`）——表面上像普通函数调用。
2. libc 把参数放到约定寄存器 / 栈，把 **system-call number** 也放好。
3. 执行 **trap 指令**：同时做两件事——**跳进 kernel** + **提升权限到 kernel mode**。
4. Kernel 查 trap table，依 syscall number 跑对应 handler。
5. 做完后执行 **return-from-trap**：**降权回 user mode** + **跳回原程序**。

> 💡 **ASIDE**：为什么 syscall 写起来像普通函数调用？
> 因为它「本来就是」函数调用，只是 libc 内部藏了 trap 指令；这段用汇编手写，普通程序员不用自己碰。

#### Trap Table（陷阱表）

- **开机时**（kernel mode）OS 用 **特权指令** 告诉硬件：每种异常 / 中断 / syscall 要跳到哪个 handler。
- 硬件把这些地址记住，直到下次重启。
- 关键保护：user 不能指定「跳去 kernel 的任意地址」，只能通过 **syscall number** 这个 indirection 请求服务 → 防止跳到 kernel 权限检查之后的位置。

#### Trap 时硬件做什么？

- 自动保存足够的寄存器（PC、flags 等）到 **per-process kernel stack**，让 return-from-trap 能正确还原。
- x86 会 push PC、flags 等到 kernel stack；不同架构细节不同但概念一致。

> ⚠️ **TIP：小心用户输入**
> 即使有 trap 机制，OS 仍须检查 syscall 参数。例如 `write()` 若传入一个指向 kernel 内存的 buffer 地址而不检查 → user 就能读任意内存。

#### LDE 完整流程（有限制版）

```
开机 (kernel mode):
  init trap table  ── 硬件记下 syscall handler 地址

执行进程:
  OS 建 process list 条目 / 分配内存 / 加载程序 / 设置 user stack
  OS 把 reg & PC 填到 kernel stack
  return-from-trap  ── 硬件 restore regs → 进 user mode → jump to main
        ↓
     user 程序 Run main()
     ...
     Call syscall
     trap into OS  ── 硬件 save regs 到 kernel stack → 进 kernel mode → 跳到 trap handler
        ↓
     OS 处理 syscall
     return-from-trap  ── restore regs → user mode → 继续 user 程序
     ...
     main return → trap (via exit())
        ↓
     OS 释放内存、从 process list 移除
```

---

### 6.3 问题二：切换进程（Switching Between Processes）

**两难**：若进程在 CPU 上跑，OS 就「没在跑」——那 OS 怎么动手切换？

#### 方法 A：合作式（Cooperative）

OS **信任** 用户程序会主动让出 CPU：
- 进程经常会主动调 syscall（读文件、建进程……）→ 顺势进 kernel。
- 也提供 **`yield` 系统调用**——什么都不做，纯粹让出 CPU。
- 程序做非法操作（除以零、非法内存访问）→ 触发 trap 也等同让出。

**致命缺陷**：若程序写成死循环、从不 syscall → **OS 永远回不来**，唯一办法是 **重启**。

> 💡 **TIP：Reboot 其实很有用**——把系统拉回已知良好状态、回收泄漏资源、易于自动化。

#### 方法 B：非合作式（Non-Cooperative）——**Timer Interrupt**

硬件的 **定时器中断**：每隔几毫秒强制打断 CPU → 跳到 OS 预先登记的 **interrupt handler** → OS 夺回控制权。

配置步骤：
1. 开机时 OS 把 **timer handler** 地址也登记到 trap table。
2. OS 用特权指令 **启动 timer**（关闭 timer 也是特权操作）。
3. 中断发生时，硬件 **自动保存** 当时 user 程序的寄存器到 kernel stack（跟 syscall trap 类似）。

> ⚡ **KEY**：timer interrupt 让 OS 在「进程不合作」时仍能定期夺回 CPU。

---

### 保存与还原 Context（Context Switch）

OS 夺回 CPU 后，由 **scheduler** 决定继续跑 A 还是切换到 B。
若要切换 → 执行 **context switch**：

**步骤**：
1. 把 **当前进程（A）** 的 kernel 寄存器（general regs、PC、kernel SP）保存到 A 的 **process structure**。
2. 从 B 的 process structure **还原** B 的寄存器与 kernel SP。
3. **切换 kernel stack**（改写 SP 为 B 的 kernel stack）。
4. 执行 return-from-trap → 硬件从 B 的 kernel stack 还原 user 寄存器 → 进 user mode → 跑 B。

#### 两种寄存器保存的对照（⚠️ 重要）

| 时机 | 保存谁的寄存器 | 谁保存 | 存到哪 |
|------|----------------|--------|--------|
| **进 kernel 时**（trap / timer int.） | user 的寄存器 | **硬件** 隐式 | 该进程的 kernel stack |
| **Context switch 时**（A→B） | kernel 的寄存器 | **OS 软件** 显式 | 各自的 process structure |

Context switch 的精妙之处：kernel 在 A 的上下文中「进入」switch 函数，却在 B 的上下文中「返回」——因为 stack 被换掉了。

#### Xv6 Context switch（x86 示意）

```asm
swtch:
  movl 4(%esp), %eax    # eax = old ptr
  popl 0(%eax)          # 保存 old IP
  movl %esp, 4(%eax)    # 保存 old stack
  movl %ebx, 8(%eax)    # 保存其他 callee-saved regs
  ...
  movl 4(%esp), %eax    # eax = new ptr
  movl 28(%eax), %ebp   # 还原 new regs
  ...
  movl 4(%eax), %esp    # ★ 换 stack
  pushl 0(%eax)         # 把 new IP 压到 stack 顶
  ret                   # 跳进新 context
```

---

### 6.4 关于并发的疑虑

Handler 执行中又来中断怎么办？
- 简单做法：**处理中断时先关中断（disable interrupts）**。但关太久会丢中断。
- 进阶做法：kernel 内部加 **lock（锁）**，多处理器尤其必要，但会带来难查的 bug。
- 详细讨论留给本书「并发（Concurrency）」篇。

---

### 6.5 性能附录：Syscall / Context Switch 有多快？

- 可用 **lmbench** 工具测量。
- 1996 年（200MHz P6）：syscall ≈ 4 μs、context switch ≈ 6 μs。
- 现代（2–3 GHz）：两者都在 **亚微秒级**。
- 但别以为换新 CPU 就一定变快——很多 OS 操作是 **memory-bound**，而内存带宽的进步远不如 CPU 速度。

---

### 类比总结：OS 给 CPU 做「婴儿防护（baby-proofing）」

- 开机时：设好 trap table、启动 timer → **把危险的东西锁起来**。
- 运行时：只让进程在 user mode 跑 → **放心让「婴儿」（进程）在房间里跑**。
- 需要特权或超时 → 进 kernel 处理 → **大人介入**。

程序跑得像直接执行一样快，OS 又始终保有控制权——这就是 **Limited Direct Execution** 的精髓。

---

### 一页要点（KEY TERMS）

| 概念                          | 要点                                          |
| --------------------------- | ------------------------------------------- |
| **User / Kernel mode**      | 硬件两种执行模式，隔离权限                               |
| **System call**             | user 向 kernel 请求服务的唯一通道                     |
| **Trap 指令**                 | 跳进 kernel + 升权（同步完成）                        |
| **Return-from-trap**        | 还原寄存器 + 降权                                  |
| **Trap table**              | 开机时设定，硬件记下 handler 地址                       |
| **System-call number**      | 以编号代替地址 → 安全的 indirection                   |
| **Kernel stack**            | 每个进程一份，硬件在 trap 时自动保存 regs                  |
| **Timer interrupt**         | 硬件机制，让 OS 能非合作地夺回 CPU                       |
| **Scheduler**               | 决定下一个跑谁（下一章主题）                              |
| **Context switch**          | OS 以软件保存 / 还原 kernel regs，切换 kernel stack   |
| **Privileged instructions** | 只能在 kernel mode 执行（设 trap table、启停 timer……） |

---

### 悬而未决的问题

> ❓ **该跑谁？**——这是 **Scheduler** 的职责，也是下一章要解决的问题。

相关笔记：
- [[OSnote/04 - The Abstraction - The Process.md]]
- [[OSnote/05 - Process API (fork, exec, wait).md]]
