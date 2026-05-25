---
title: "Q13 WeakMap - End-of-class Briefing"
course: "Frontend Masters - Web Dev Quiz"
lesson: "Q13 WeakMap"
course_url: "https://frontendmasters.com/courses/web-dev-quiz/q13-weakmap/"
notebooklm: "https://notebooklm.google.com/notebook/82628d5e-bb3a-48af-9d8b-55b763d4a880"
created: "2026-05-26T00:37:46"
source_audio: 'C:\Users\user\Desktop\Silicon''s AI Lab\Frontend_Note\01_Sources\frontendmasters-com-courses-web-dev-quiz-q13-weakmap\Learn Q13 WeakMap Advanced Web Development Quiz.m4a'
source_video: 'C:\Users\user\Desktop\Silicon''s AI Lab\Frontend_Note\01_Sources\frontendmasters-com-courses-web-dev-quiz-q13-weakmap\Learn Q13 WeakMap Advanced Web Development Quiz.mp4'
---

# Q13 WeakMap - End-of-class Briefing

> 来源：NotebookLM 基于 Learn Q13 WeakMap Advanced Web Development Quiz.m4a 生成。NotebookLM 复制出的文本未保留可点击 citation 标记；页面中该回答对应 1 个 source。

这是一份根据您上传的关于 **WeakMap** 的音频转录资料整理的课后简报：

### **SECTION A. 核心术语定义 (Fundamental Definitions)**

1.  **WeakMap**：一种特殊的键值对集合，其键必须是对象或函数，且对键保持弱引用。
2.  **堆 (Heap)**：存储复杂对象（如 WeakMap 和用户对象）的内存区域。
3.  **弱引用 (Weak Reference)**：WeakMap 特有的引用方式，它不会阻止垃圾回收器回收其作为键的对象。
4.  **强引用 (Strong Reference)**：普通 Map 使用的引用方式，只要引用存在，对象就无法被回收。
5.  **垃圾回收 (Garbage Collection)**：自动释放不再被任何路径引用的对象所占用内存的过程。
6.  **内存泄漏 (Memory Leak)**：指对象虽不再使用但因仍被引用而无法被回收，导致内存持续占用的现象。
7.  **全局执行上下文 (Global Execution Context)**：程序运行的基础环境，是判断对象是否仍被引用的起始点。
8.  **DOM 节点 (DOM Node)**：网页文档的元素，常作为 WeakMap 的键来存储与其相关的临时数据。
9.  **迭代器协议 (Iterator Protocol)**：一种遍历集合的标准，但 WeakMap 并不实现此协议，因此不可遍历。
10. **原始数据类型 (Primitive Data Types)**：如字符串、数字等按值存储的类型，不能作为 WeakMap 的键。

---

### **SECTION B. 主要概念 (Main Concepts)**

1.  **垃圾回收的触发机制**：在 WeakMap 中，如果一个作为键的对象被设置为 `null`（且没有其他强引用），那么该对象及其在 WeakMap 中对应的条目都可以被垃圾回收。
2.  **弱引用 vs. 强引用的差异**：资料通过对比展示，普通 Map 会建立强引用，导致即使删除了原始对象，Map 内部依然保留对该对象的引用，使其留在堆内存中。
3.  **内存管理自动化**：WeakMap 的核心设计目标是确保当对象“不再被需要”时（例如用户登出或删除），相关的数据条目能自动从内存中消失。
4.  **键类型的严格限制**：WeakMap 仅接受对象和函数作为键。这是因为只有这些引用类型才能实现“引用”机制，而原始类型是内存副本，无法实现弱引用。
5.  **不可遍历性与安全性**：由于 WeakMap 的条目可能随时被垃圾回收，它不支持展开运算符或迭代，这种特性也使其在处理某些敏感属性时更具封闭性。

---

### **SECTION C. 概念之间的关系 (Relationships Between Concepts)**

*   **WeakMap 与内存泄漏的对立关系**：普通 Map 是内存泄漏的潜在来源，因为它们会“强行”留住对象；而 WeakMap 是预防内存泄漏的工具，它顺应对象的生命周期。
*   **引用类型与机制的依赖关系**：弱引用机制**依赖于**引用类型的特性。因为原始类型（如字符串）是按值传递的，没有引用的概念，所以无法成为 WeakMap 监控回收的对象。
*   **对象存续与条目存续的联动**：WeakMap 条目的“寿命”完全**取决于**其键对象的强引用是否存在。一旦全局执行上下文不再指向该键对象，WeakMap 里的对应数据也会随之失效。

---

### **SECTION D. 实际应用 (Practical Applications)**

1.  **给 DOM 节点附加属性**：这是 WeakMap 最常见的用途。当一个 DOM 节点从文档中移除（卸载）时，WeakMap 中与其关联的所有属性会自动清理，无需手动管理内存。
2.  **管理临时元数据**：例如为用户对象添加临时的“秘密令牌”或权限标签。当用户对象被销毁（如用户登出）时，这些不属于对象本身的额外属性也会被一并安全移除。
3.  **防止缓存导致的内存溢出**：在需要以对象为键进行缓存的场景下，使用 WeakMap 可以确保缓存不会无限增长，因为一旦原始对象失效，缓存条目也会自动释放。

