---
tags: [OS, process, unix, api]
source: cpu-api.pdf
chapter: 5
title: "Interlude: Process API"
---

# 第 5 章 Process API（UNIX 進程 API）

> **核心問題（CRUX）**：作業系統應該提供怎樣的介面來建立與控制進程？如何設計才能兼顧「強大功能、易用、高效能」？

UNIX 用一組看似奇怪但極其強大的系統呼叫來管理進程：
- `fork()` — 建立新進程
- `exec()` — 讓進程載入並執行另一個程式
- `wait()` — 父進程等待子進程結束

---

## 5.1 `fork()` — 建立新進程

### 行為
- 呼叫 `fork()` 後，OS 會建立一個「幾乎完全複製」的新進程（child），原進程稱為 parent。
- 複製內容：位址空間（私有記憶體副本）、暫存器、PC（程式計數器）、已開啟的檔案描述符 等。
- **child 不會從 `main()` 開始跑**，而是像自己也剛呼叫完 `fork()` 一樣，從 `fork()` 的回傳點繼續執行。

### 回傳值（用來區分父子）
| 角色 | `fork()` 回傳值 |
|------|-----------------|
| parent | 子進程的 PID（> 0） |
| child | `0` |
| 失敗 | `< 0` |

```c
int rc = fork();
if (rc < 0)        { /* fork 失敗 */ }
else if (rc == 0)  { /* child 執行此區 */ }
else               { /* parent 執行此區, rc = child PID */ }
```

### 非決定性（Non-determinism）
父子誰先跑取決於 **CPU scheduler**，所以輸出順序不固定。此不確定性在 **多執行緒／並發** 章節會更嚴重。

---

## 5.2 `wait()` — 父等子

- `wait(NULL)` 會 **阻塞** 父進程，直到任一子進程結束才返回。
- 加了 `wait()` 後，輸出變成 **確定性**：child 必定先印完畢再換 parent 印。
- `waitpid()` 是 `wait()` 的進階版（可指定 PID、指定行為 flags）。
- ⚠️ 少數情況 `wait()` 會在子進程退出前返回（見 man page）。

---

## 5.3 `exec()` — 換一顆新靈魂

`fork()` 只能複製「同一程式」；若要執行 **不同程式**，用 `exec()`。

### 行為
1. 取 executable 名稱（如 `wc`）與參數。
2. **載入** 新程式的 code 與 static data，覆寫目前進程的 code segment / static data。
3. 重新初始化 heap、stack 等記憶體區域。
4. 直接執行新程式。

### 重要特性
- **不建立新進程**，而是把 **當前進程轉型** 為另一個程式。
- 成功的 `exec()` **永不返回**（呼叫後原程式碼就消失了）。
- Linux 有 6 個變體：`execl`, `execlp`, `execle`, `execv`, `execvp`, `execvpe`（差別在參數傳遞方式、是否用 PATH、是否帶 env）。

```c
char *myargs[3] = { "wc", "p3.c", NULL };
execvp(myargs[0], myargs);  // 之後的程式碼不會執行
```

---

## 5.4 為什麼要把 fork 與 exec 分開？

> **Lampson's Law**: "Get it right. Neither abstraction nor simplicity is a substitute for getting it right."

**關鍵洞察**：分離讓 shell 能在 `fork()` 之後、`exec()` 之前插入程式碼，去 **改動子進程的執行環境**，達成許多功能而不需修改被執行的程式。

### Shell 工作流程
1. 顯示 prompt、讀使用者輸入。
2. `fork()` 出 child。
3. child 呼叫 `exec()` 執行命令。
4. parent 呼叫 `wait()` 等 child 結束。
5. 回到步驟 1。

### **應用範例：I/O 重導向（`>`）** — 深入解析

#### 前置概念：File Descriptor (fd)
每個進程都有一張 **fd 表**（開檔表），index 從 0 開始，每格對應一個已開啟的檔案／裝置：

| fd | 名稱 | 常數 | 預設指向 |
|----|------|------|---------|
| 0 | stdin | `STDIN_FILENO` | 鍵盤 |
| 1 | stdout | `STDOUT_FILENO` | 螢幕 |
| 2 | stderr | `STDERR_FILENO` | 螢幕 |

> **關鍵**：`printf("hi")` 實際上就是 `write(1, "hi", 2)` — 它只寫到 **fd=1**，根本不在乎 fd=1 連到哪裡。這個抽象層是整套設計的基礎。

#### 兩條核心規則
1. **`open()` 回傳「當前最小可用 fd」**（從 0 往上掃，第一個空格就拿來用）。
2. **`fork()` 複製整張 fd 表；`exec()` 保留 fd 表**（除非設 `FD_CLOEXEC`）。

#### `wc p3.c > newfile.txt` 一步步發生什麼事

| 步驟  | 動作                                                        | child 的 fd 表                  |
| --- | --------------------------------------------------------- | ----------------------------- |
| 0   | shell 還沒動作                                                | `[0:鍵盤, 1:螢幕, 2:螢幕]`          |
| 1   | shell `fork()` 出 child（fd 表複製一份）                          | `[0:鍵盤, 1:螢幕, 2:螢幕]`          |
| 2   | child `close(STDOUT_FILENO)`                              | `[0:鍵盤, 1:✗空, 2:螢幕]`          |
| 3   | child `open("./newfile.txt", ...)` → 最小可用是 1              | `[0:鍵盤, 1:newfile.txt, 2:螢幕]` |
| 4   | child `execvp("wc", ...)` — **程式碼換掉但 fd 表保留**             | `[0:鍵盤, 1:newfile.txt, 2:螢幕]` |
| 5   | `wc` 內部呼叫 `printf(...)` = 寫 fd=1 = **寫到 newfile.txt**     | 同上                            |
| 6   | parent `wait()` 等 child 結束，印新 prompt（parent 的 fd=1 從未被動過） | —                             |

#### 為什麼這設計漂亮？
- `wc` 原始碼 **一行都不用改**，卻能被外部重導向到任意檔案／pipe／網路。
- 體現 Unix 哲學：「程式只管讀 stdin、寫 stdout；接到哪由呼叫者決定」。
- **fork 與 exec 分離** 就是為了給 shell 一個時機窗：fork 完成、exec 尚未發生前，child 的 fd 表可以任意擺佈。若像 Windows 的 `CreateProcess()` 一步到位，就沒有這種彈性。

### 應用範例：Pipe（`|`）
- 使用 `pipe()` 建立 kernel 內的 queue。
- 一進程的 stdout 連到 pipe 寫端，另一進程的 stdin 連到 pipe 讀端。
- 可串接多個命令，例：`grep -o foo file | wc -l`。

---

## 5.5 進程控制與使用者

### Signals（訊號）
- `kill()` 系統呼叫可送 signal 給進程。
- 常見鍵盤組合：
  - `Ctrl-C` → `SIGINT`（中斷，通常終止）
  - `Ctrl-Z` → `SIGTSTP`（暫停；之後可 `fg` 繼續）
- 進程可用 `signal()` 註冊 handler 來 **捕捉** 特定 signal 並自訂反應。
- 能傳給個別進程，也能傳給 **process group**。

### User（使用者）
- 多人共用系統時，若任何人能亂送 signal 會造成可用性／安全問題。
- 解法：引入 **user** 概念，需用密碼登入。
- 使用者 **只能控制自己的進程**；OS 負責分配 CPU、記憶體、磁碟等資源。

### Superuser (root)
- 特權帳號，可 kill 任何進程、執行 `shutdown` 等。
- 「能力越大，責任越大」 — 平時用一般帳號，必要時再切 root。

---

## 5.6 常用工具

| 工具 | 用途 |
|------|------|
| `ps` | 列出目前進程（搭配 flags 可看更多欄位） |
| `top` | 即時顯示 CPU／資源使用最多的進程 |
| `kill` / `killall` | 送 signal 給進程（小心別 kill 到 window manager） |
| CPU meters（如 MenuMeters） | 即時觀察負載 |
| **man pages** | 最原始也最權威的文件；`RTFM` = Read The Fine Manual |

---

## 5.7 小結與關鍵術語

### Key Terms
- **PID (Process ID)**：進程識別碼，用以指名操作。
- **fork()**：建立幾乎完全相同的 child。
- **wait() / waitpid()**：parent 等 child 結束。
- **exec()**：child 脫胎換骨為新程式。
- **Shell**：利用 fork + exec + wait 執行命令；分離設計讓 **I/O 重導向、pipe** 等特色得以實現且不用改程式本身。
- **Signals**：外部事件機制（stop / continue / terminate）。
- **User / Superuser**：權限隔離，保障安全與穩定。

### 延伸思考
- 現代研究（[B+19] "A fork() in the road"）批評 `fork()` 有諸多缺陷，提倡更簡單的 `spawn()` 介面。
- 進一步閱讀：Stevens & Rago, *Advanced Programming in the UNIX Environment* (APUE)。

---

## 範例程式速查

| 程式     | 展示內容                                              |
| ------ | ------------------------------------------------- |
| `p1.c` | 單純呼叫 `fork()`，觀察 parent/child 輸出                  |
| `p2.c` | `fork()` + `wait()`，確保順序                          |
| `p3.c` | `fork()` + `exec("wc", ...)` + `wait()`           |
| `p4.c` | 在 `exec()` 前 `close(STDOUT)` + `open(file)` 實作重導向 |

```c
// 核心模式（典型 shell 結構）
int rc = fork();
if (rc == 0) {
    // 可選：修改環境（關 fd、開檔、設 pipe 等）
    execvp(prog, args);      // 不會返回
} else {
    wait(NULL);              // 等子進程結束
}
```
