---
tags:
  - OSTEP
  - 实验
  - 进程调度
created: 2026-04-18
related:
  - "[[04 - The Abstraction - The Process]]"
  - "[[05 - Process API (fork, exec, wait)]]"
  - "[[Process_py]]"
---

## 🧪 OSTEP Chapter 7 进程调度实验

> 使用 [[process-run.py]] 模拟器观察进程状态随时间变化。
> 运行代码块需要装 **Execute Code** 插件(设置 → 社区插件 → 搜索 `Execute Code`)。
> 本笔记使用 `powershell` 代码块直接调用本地 Python,避开了 Pyodide 沙箱(它不支持子进程)。
> 需在 Execute Code 设置里启用 **PowerShell**,并确保 `python` 在 PATH 中。

---

### 📘 参数速查

| 标志             | 含义                          | 常用值                                 |
| -------------- | --------------------------- | ----------------------------------- |
| `-l X:Y,X:Y`   | 进程列表:X=指令数, Y=CPU 概率(0-100) | `5:100,5:0`                         |
| `-P "c3,i,c2"` | 精细控制:c=计算 i=IO              | `c3,i,c2`                           |
| `-L N`         | IO 持续多少个 tick               | `5`(默认)/ `10`                       |
| `-S`           | 切换时机                        | `SWITCH_ON_IO` / `SWITCH_ON_END`    |
| `-I`           | IO 完成后的调度                   | `IO_RUN_LATER` / `IO_RUN_IMMEDIATE` |
| `-c`           | 显示真实运行 trace(不加只显示题目)       | —                                   |
| `-p`           | 打印统计(CPU/IO 忙碌率)            | —                                   |
| `-s N`         | 随机种子                        | `0`                                 |

---

### 实验 1 · 两个纯 CPU 进程

**问题**:两个完全相同的 CPU 密集型进程,系统如何调度?CPU 利用率是多少?

```powershell
cd 'C:\Users\user\Desktop\operation system\OSnote'
python .\process-run.py -l 5:100,5:100 -c -p
```

**预期观察**:
- PID 0 先跑满 5 个 tick,PID 1 再跑 5 个 tick(默认 `SWITCH_ON_IO`,没 IO 就不切)
- CPU Busy = 100%,IO Busy = 0%

---

### 实验 2 · CPU 密集 Vs IO 密集

**问题**:一个纯 IO 进程 + 一个纯 CPU 进程。为什么整体效率这么差?

```powershell
cd 'C:\Users\user\Desktop\operation system\OSnote'
python .\process-run.py -l 3:0,5:100 -c -p
```

**预期观察**:
- PID 0 发起 IO 后进入 BLOCKED,但因为默认 `IO_RUN_LATER`,系统不切到 PID 1
- 大量 tick CPU 空转,利用率不高

---

### 实验 3 · `SWITCH_ON_IO` Vs `SWITCH_ON_END`

#### 3a · 保持默认 `SWITCH_ON_IO`(发起 IO 就切)

```powershell
cd 'C:\Users\user\Desktop\operation system\OSnote'
python .\process-run.py -l 3:0,5:100 -S SWITCH_ON_IO -c -p
```

#### 3b · `SWITCH_ON_END`(只在进程结束才切)

```powershell
cd 'C:\Users\user\Desktop\operation system\OSnote'
python .\process-run.py -l 3:0,5:100 -S SWITCH_ON_END -c -p
```

**对比观察**:3a 总时间应该明显更短,因为 IO 等待时 CPU 不再空转。

---

### 实验 4 · `IO_RUN_LATER` Vs `IO_RUN_IMMEDIATE`

#### 4a · IO 完成后稍后再跑(默认)

```powershell
cd 'C:\Users\user\Desktop\operation system\OSnote'
python .\process-run.py -l 6:50,5:100,5:100,5:100 -S SWITCH_ON_IO -I IO_RUN_LATER -c -p
```

#### 4b · IO 完成后立即抢占

```powershell
cd 'C:\Users\user\Desktop\operation system\OSnote'
python .\process-run.py -l 6:50,5:100,5:100,5:100 -S SWITCH_ON_IO -I IO_RUN_IMMEDIATE -c -p
```

**对比观察**:
- `IO_RUN_LATER`:发起 IO 的进程要等当前正在跑的进程让出才回来
- `IO_RUN_IMMEDIATE`:IO 一完成立刻把那个进程调上 CPU,响应性更好,但上下文切换更频繁

---

### 实验 5 · 用 `-P` 精细定制程序

**问题**:设计一个有"先计算-IO-再计算"混合模式的进程,手动画出状态图。

```powershell
# -P "c3,i,c2:c5" 表示:
#   进程 0: 计算3次 → IO → 计算2次
#   进程 1: 计算5次
cd 'C:\Users\user\Desktop\operation system\OSnote'
python .\process-run.py -P 'c3,i,c2:c5' -S SWITCH_ON_IO -I IO_RUN_IMMEDIATE -L 3 -c -p
```

---

### 实验 6 · 只出题,不给答案(自测)

去掉 `-c` 就会变成"考试模式":只告诉你有哪些进程、什么行为,让你自己画 trace。

```powershell
cd 'C:\Users\user\Desktop\operation system\OSnote'
python .\process-run.py -l 3:0,5:100 -S SWITCH_ON_END
```

> 先自己手推 trace,再加回 `-c` 对答案。

---

### 📝 我的思考笔记

> 写下每个实验的**观察结论**和**发现的反直觉之处**。

#### 实验 1 结论


#### 实验 2 结论


#### 实验 3 对比(关键!)


#### 实验 4 对比


#### 实验 5 自定义场景


---

### 🔗 延伸

- 📖 原教材: OSTEP Chapter 7《Scheduling: Introduction》
- 🧩 下一个模拟器: `scheduler.py`(FIFO / SJF / STCF / RR 对比)
- 🔀 相关概念: [[05 - Process API (fork, exec, wait)]] 中的 fork/wait 如何触发调度切换
