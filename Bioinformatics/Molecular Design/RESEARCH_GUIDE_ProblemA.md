# 研究指南：测试LLM + 构建Portfolio

这份文档假设你刚拿到 codon optimization challenge 项目，要先熟悉这个领域、
然后用它来测试当前的前沿LLM、最后把它扩成一个完整的portfolio。

不需要先看任何外部资料；本文档自包含。

---

## Part 0：先理解你手上这道题在生物学上做什么（30分钟）

如果不熟悉codon optimization，先建立直觉。可以跳过这一节如果你已经懂。

### 问题来源

蛋白质药物（抗体、酶、疫苗）现在大部分是**异源表达**的：把人源/病毒源/
合成的蛋白基因放进E. coli、CHO、酵母里大规模生产。但不同物种**偏爱不同
密码子**——人源基因直接放进E. coli表达量往往很低。

"Codon optimization"就是：保持**蛋白序列不变**，但把DNA里每个密码子
**替换成宿主偏好的同义密码子**，让蛋白能高表达。

### 为什么不是简单的查表替换

如果只看CAI（codon adaptation index，越接近1越像高表达基因），那就是
查表问题——每个氨基酸选频率最高的密码子就完了。但实际有一堆坑：

1. **5'端二级结构**：mRNA的前~60nt如果折叠太紧，核糖体扫不上去，
   翻译起始效率会暴跌。E. coli和酵母的相关性是经典论文（Kudla 2009）。
2. **GC含量**：太低易降解，太高难合成、有secondary structure风险。
3. **限制酶位点**：分子克隆的时候要切，CDS内部出现切位点是灾难。
4. **均聚物**：AAAAAA、GGGGGG之类的run会让DNA合成失败或测序出错。
5. **滑动窗口GC**：某段局部GC过高/过低就会出问题，即使全局正常。
6. **CpG岛、剪接位点、SD序列**：根据宿主还有其他一堆domain-specific约束。

### 这道题的难点本质

**约束之间互相打架**：
- 高CAI密码子在E. coli里GC通常偏高 → 5'端易形成强结构
- 降低5'端GC来打开结构 → 局部CAI下降 → 全局CAI被拖累
- 想加点A/T调GC → 容易产生TAA/TTT/CAA等亚优密码子

所以这不是"查表+硬约束剪枝"，而是**真正的组合优化**，需要算法
（模拟退火、整数规划、约束满足等）。LLM如果不调用代码工具、只靠
"思考+输出"，是几乎不可能解对的——这就是出题人想压测的能力边界。

### 行业现实

- 真实生产环境用商用工具：GeneArt (Thermo)、IDT Codon Optimization Tool、
  DNAWorks。这些工具内部都跑某种优化算法。
- mRNA疫苗（Moderna/Pfizer）的codon optimization更复杂，还要考虑
  uridine depletion、伪尿苷上下文、5'UTR结构等。
- 你这道题用的约束已经覆盖了**入门工业级**的复杂度。

---

## Part A：测试当前LLM（半天搞定）

目的是搞清楚：**你出的这道题对今天的前沿模型，难度有多大？**
这个数据决定了你后面所有出题策略。

### A.1 测试目标

你想得到一张表，长这样：

| 模型 | 是否给出有效DNA | 是否通过翻译 | 失败约束 | CAI | 5'端ΔG |
|------|-----------------|-------------|----------|-----|--------|
| GPT-5 (no tools) | ✓ | ✓ | 5'结构 | 0.95 | -16.3 |
| Claude Opus 4.7 (no tools) | ✓ | ✓ | 5'结构、GC窗口 | 0.93 | -14.1 |
| Gemini 2.5 Pro (no tools) | ✓ | ✗ (translation错1处) | -- | -- | -- |
| GPT-5 (with code interpreter) | ✓ | ✓ | -- | 0.97 | -7.8 |
| ... | ... | ... | ... | ... | ... |

注意区分两类测试：
- **No tools**：纯文本in/out。这是这道题真正想压测的"推理能力上限"。
- **With tools**：允许写代码并执行。压测的是"agentic execution"。
  这是BixBench和你目标雇主真正关心的能力。

### A.2 准备测试材料

把项目里的 `challenge_output/PROBLEM.md` 当作发给模型的题面。

**重要预处理**：在题面里加一句话给模型公平的机会，否则你测的是
"模型能不能猜中规则细节"而不是"能不能解题"。建议在题面顶部加：

```
You may compute any numerical values you need step by step. If you have
access to code execution tools, use them. The validator uses standard
nearest-neighbor RNA folding (seqfold/ViennaRNA defaults at 37°C) and
the Sharp & Li 1987 CAI formula with E. coli K12 codon frequencies.
```

### A.3 测试矩阵

按顺序跑这些组合，每个组合**至少跑3次取最好成绩**（LLM有随机性）：

**第一轮：基线 no-tool 测试**

1. GPT-5 (或当时最强的GPT) — 不开code interpreter
2. Claude Opus 4.x — 不开任何工具
3. Gemini 2.5 Pro — 不开任何工具
4. 一个开源模型作对照：Llama 3.3 70B 或 DeepSeek V3，关tool

每次只给PROBLEM.md，让它给出最终DNA。把答案保存成 `gpt5_run1.txt` 等。

**第二轮：允许tool use**

5. GPT-5 + code interpreter
6. Claude + code execution（你正在用的claude.ai已经有了）
7. 任意 + 给它你的solver.py作为参考代码（看会不会作弊性地跑你的solver）

**第三轮：探索失败模式**

8. 同样的题，让模型**先解释它会怎么做**，再给答案（chain-of-thought
   prompting）。看推理过程和答案是否一致。
9. 把题改成只有3个约束的简化版，看难度从哪一档开始崩。
10. 让模型用Python "in its head" 跑你的validator，看它能不能自己
    发现自己的答案有违规。

### A.4 跑grader收集数据

每个答案都用：

```bash
python check_submission.py challenge_output/ <model_run.txt>
```

把每次的输出存下来，建议做一个简单CSV：

```csv
model,run,tools,valid,translation_ok,restriction_ok,gc_global_ok,gc_window_ok,homopolymer_ok,cai,dg_5prime,verdict
gpt-5,1,none,false,true,true,true,false,true,0.94,-15.2,FAIL
gpt-5,2,none,false,true,true,true,true,true,0.91,-12.8,FAIL
gpt-5,3,code_interp,true,true,true,true,true,true,0.96,-8.5,PASS
claude-opus,1,none,false,true,true,true,true,true,0.93,-14.1,FAIL
...
```

我建议你写个小脚本（30行Python）把check_submission.py改造成把结果
直接append到CSV里，免得手抄。

### A.5 分析的关键问题

收集完数据，回答这几个问题——它们直接转化为你后面出题的策略：

**Q1：哪个约束最容易让模型失败？**

我预测会是 5'端ΔG。如果数据印证，这个约束就是这类题的"杀手特征"，
后面所有变体都应该保留它。

**Q2：模型在no-tool情况下能力上限在哪？**

如果所有no-tool模型都fail，但开了code interpreter就过，那说明这道题
当前对纯reasoning是足够难的——这是Mindrift雇主想要的难度。如果
no-tool都能过，说明你这道题对前沿模型偏简单，要升级。

**Q3：模型的失败是"不会做"还是"算错了"？**

让模型自己解释推理过程。如果它说"我会先优化CAI再调5'端"但实际上
没调5'端就交卷了——那是**执行力**问题，不是推理力问题。这两类失败
对题目设计的启发不一样：
- 推理力问题 → 题已经够好，可以直接交付
- 执行力问题 → 你应该再加几个相互冲突的约束，让单步推理无法解

**Q4：模型有没有"作弊"或者"幻觉"？**

常见作弊：
- 编造一个不存在的Python函数（"假装"调用了优化器）
- 给出的DNA其实没翻译对，但它自信声称对了
- 用伪代码代替真DNA交卷
- 编造CAI数值（说"CAI=0.98"但实际算出来0.84）

这些都不算fail——但记录下来，它们是你后面写"failure modes"
文档的素材，对Mindrift来说极有价值。

**Q5：相同模型多次运行的方差有多大？**

如果同一个模型10次里只有1次过，那这道题的"通过"是噪声而不是能力。
雇主会问这个问题。一个好题的pass rate应该稳定地体现模型间差异。

### A.6 大约花多久

- 准备：30分钟（写CSV脚本、改prompt）
- 跑测试：每次模型推理 + grade大约5分钟，10个组合×3轮 = 2.5小时
- 分析：1小时

半天内你会拿到一张完整的难度评估表。**这张表本身就是portfolio的一部分**。

### A.7 给Mindrift申请时怎么用

应聘时附一段："I tested this problem against four frontier models
(GPT-5, Claude Opus 4.x, Gemini 2.5 Pro, DeepSeek V3) in both no-tool
and tool-use settings. No-tool pass rate: 0/12. Tool-use pass rate:
8/12. The dominant failure mode is the 5'-mRNA structure constraint,
which all no-tool models violate by 4-8 kcal/mol — they correctly
optimize CAI but cannot internally simulate the nearest-neighbor
folding energy."

这一段话能让你的申请从"我懂生物 + 懂Python"升级到"我懂如何评估
前沿模型的能力边界"——这正是Mindrift的核心需求。

---

## Part C：把这一道题扩成完整Portfolio（1-2周）

A方案做完，你就有了基线数据。现在把它做大做齐。

### C.1 Portfolio目标

你最终要交付的是一个**题包**，结构像这样：

```
portfolio/
├── README.md                          总览，包含方法论、引用、failure mode分析
├── PROBLEM_001_ecoli_easy/            E. coli 50aa + 3约束（入门）
├── PROBLEM_002_ecoli_medium/          E. coli 100aa + 7约束（你现在的）
├── PROBLEM_003_ecoli_hard/            E. coli 300aa + 10约束
├── PROBLEM_004_human_cho/             人源蛋白 → CHO，加CpG岛和剪接位点
├── PROBLEM_005_yeast/                 酵母S. cerevisiae偏好
├── PROBLEM_006_mrna_vaccine/          mRNA疫苗版（U-depletion、5'UTR）
├── PROBLEM_007_phage_capsid/          噬菌体衣壳蛋白，加codon pair bias
├── PROBLEM_008_membrane/              膜蛋白，加跨膜区slow-translation窗口
├── PROBLEM_009_industrial_enzyme/     工业酶，加全长secondary structure约束
├── PROBLEM_010_dual_host/             双宿主表达，需要同时优化两个CAI
├── shared/                            共享的validator、solver、codon table
└── evaluation/
    ├── baseline_results.csv           你跑出的所有模型基线
    ├── difficulty_calibration.md      每道题的难度评估
    └── failure_modes_catalog.md       常见失败模式总结
```

10道题，难度递增 + 应用场景多样化，这是Mindrift那种平台一次申请
就能拿到的最大筹码。

### C.2 难度递增的具体维度

不要随机加约束。按这5个维度系统地变难：

**维度1：蛋白长度** — 50aa → 100aa → 300aa → 800aa
- 长度↑ 解空间指数增长，约束之间互相耦合更严重
- 800aa的蛋白要把所有约束同时满足，纯推理模型几乎不可能

**维度2：约束数量** — 3 → 7 → 12 → 18
- 每加一个约束，可行域缩一档
- 关键是加**互相冲突**的约束，不是加冗余约束

**维度3：约束严格度** — 宽 → 中 → 严
- 同一个约束（如5'端ΔG）可以从 ≥-15 收紧到 ≥-5
- 收紧到接近物理可行性下限的题，会逼出真正的优化

**维度4：宿主复杂度** — 原核 → 真核 → 哺乳动物 → mRNA疫苗
- 每个宿主有独有的关键约束
- mRNA疫苗版本应该加：U-depletion、伪尿苷位点优化、5'cap context、
  3'-poly-A前的motif

**维度5：目标函数复杂度** — 单目标 → 多目标 → Pareto
- 单目标：最大化CAI
- 多目标：CAI + tAI（tRNA adaptation index）的加权
- Pareto：在CAI、CpG数、mRNA half-life之间求Pareto front

### C.3 具体的10道题设计

我给你**完整的题号-差异点-验收标准**清单，你照着填就行：

| # | 名称 | 蛋白长度 | 宿主 | 新增约束（在题2基础上） | 目标分数 | 预估SA求解时间 |
|---|------|----------|------|-------------------------|----------|----------------|
| 1 | ecoli_easy | 50aa | E. coli | 去掉5'ΔG和窗口GC | CAI≥0.90 | <1min |
| 2 | ecoli_medium | 100aa | E. coli | 当前题 | CAI≥0.95 | ~3min |
| 3 | ecoli_hard | 300aa | E. coli | + 禁CpG岛、+ codon pair bias | CAI≥0.92 | ~15min |
| 4 | human_cho | 200aa | CHO | 切换codon table、+ 禁人源剪接位点 | CAI≥0.85 | ~10min |
| 5 | yeast | 150aa | S. cerevisiae | 切换codon table、+ 禁poly-A signal | CAI≥0.88 | ~5min |
| 6 | mrna_vaccine | 250aa | 哺乳细胞 | + U≤17%、+ 优先U替换、+ 全长MFE范围 | 复合分 | ~20min |
| 7 | phage_capsid | 180aa | E. coli | + codon pair bias契合自然分布 | CAI×CPB≥X | ~10min |
| 8 | membrane | 220aa | E. coli | + 在跨膜区强制使用慢密码子 | CAI≥0.80（局部例外） | ~8min |
| 9 | industrial_enzyme | 500aa | E. coli | + 全长ΔG范围、+ 二级结构窗口约束 | CAI≥0.88 | ~30min |
| 10 | dual_host | 200aa | E. coli + 酵母 | 同时CAI_ecoli≥0.85且CAI_yeast≥0.80 | 双满足 | ~15min |

每道题的关键不是"加更多约束"而是"找到能逼出新失败模式的约束"。

### C.4 每道题的标准交付件

按这个模板做每道题，**严格一致**（雇主审稿时的可读性指数级提升）：

```
PROBLEM_00X_name/
├── PROBLEM.md                   题面（候选人看到的）
├── metadata.json                内部数据（baseline、threshold、约束细节）
├── solver.py                    或solver_extension.py，调你的shared solver
├── validator_extension.py       新约束的validation函数
├── reference_solution.txt       一个合格解
├── naive_failure.txt            naive answer + 它fails在哪
├── llm_baseline.csv             你跑的GPT-5/Claude/Gemini基线
└── difficulty_notes.md          为什么这道题难，难在哪，难度级别justification
```

最后那个 `difficulty_notes.md` 是关键——它是你给雇主看的"出题人思考过程"，
比题目本身更能体现你的水平。模板：

```markdown
# Problem X — Difficulty Justification

## Why this problem cannot be solved by pattern matching
- The target protein is synthetic (de novo, never published).
- All constraints are quantitative and require explicit computation.
- The pass threshold was set by an SA solver running 50k iterations.

## What makes this harder than Problem X-1
- Added constraint Y, which conflicts with existing constraint Z because
  [biological reason].
- This forces the solver to navigate a Pareto trade-off rather than
  greedy optimization.

## Failure modes observed in baseline LLM runs
1. **Greedy CAI**: Picks top-frequency codons → violates constraint Y in N% of runs.
2. **Hallucinated metric**: Reports CAI=0.97 in chain-of-thought but actual
   CAI is 0.84.
3. **Partial solve**: Satisfies 8/9 constraints, fails on the new one.

## Baseline pass rate (n=3 runs each)
- GPT-5 (no tools):       0/3
- Claude (no tools):      0/3
- Gemini (no tools):      0/3
- GPT-5 (code interp):    2/3
- Claude (code exec):     3/3

## Solver reachability
- 50k SA iterations, T=1.0→0.001, achieves CAI=0.XX
- Pass threshold set at CAI=0.XX (95% of baseline) to allow valid
  but suboptimal solutions.
```

### C.5 时间预算（实际执行）

按"每天工作3-4小时业余时间"估算：

| 阶段 | 时间 | 产出 |
|------|------|------|
| Part A完整跑完 | 1天 | baseline CSV + 失败模式归纳 |
| 把题2重构成shared模块 | 1天 | shared/codon_table.py, validator.py, solver.py（可被复用） |
| 题1（简化版）+ 题3（加难版） | 1天 | 2个题包 |
| 切换codon table支持其他宿主 | 1天 | 题4、5 |
| mRNA疫苗约束（最复杂） | 2天 | 题6（这道是亮点） |
| 剩下的特种题 | 2天 | 题7-10 |
| 跑LLM基线 + 写difficulty notes | 2天 | 全部baseline和分析 |
| 写README.md总览 + 整理交付 | 1天 | 整个portfolio |

合计 **约2周**，可压缩到10天。

### C.6 申请Mindrift时的提交策略

**不要一次给10道题**。Mindrift是平台型公司，他们要的是稳定供货。

应聘时：
1. 申请表里附 **2-3道题**（题2 + 题6 + 题10），加上baseline数据
2. 简短说明你的出题方法论（1页纸）
3. 注明你可以按需出题，每周3-5道

获得offer后再交付剩余的题。这样：
- 你的申请材料够强（不是只交了一道题）
- 但也没有把所有牌打出去（保留了"持续产出"的价值）

### C.7 避免的陷阱

**别用真实蛋白做题面**。GPT-5和Claude训练数据里有UniProt、PDB全套。
你出"GFP的codon optimization"，模型可能在训练集里见过商业优化结果。
解决：用真实蛋白的氨基酸组成统计做特征匹配，但**序列是合成的**。

**别让题目可被回避**。比如约束"CAI≥0.75"如果没有上限，模型给个
CAI=0.751的答案也算过——这就让"maximize"变成"satisfice"，难度降一档。
解决：用相对baseline的pass threshold（你这道题用的 0.95×baseline 是对的）。

**别用过时的constraint值**。比如5'端ΔG的临界值要参考最新文献。
2009年Kudla的论文是经典，但2020年后的mRNA疫苗时代有新数据。
解决：在difficulty_notes里注明参考文献和阈值出处。

**别忽略reverse strand**。当前validator只检查正链限制酶位点。
真实克隆要双链检查。你的题3（hard版）应该加上这个，作为"难一档"
的特征之一。

---

## 总结：从这里到拿到offer的最短路径

1. **今晚**：花1小时读Part 0，建立领域直觉
2. **明天**：跑Part A，半天得到baseline数据
3. **第3-4天**：决定Portfolio的最终10题清单，开始重构成shared模块
4. **第5-12天**：按C.5的节奏出齐10道题 + baseline
5. **第13-14天**：写README、整理交付物、写申请材料
6. **第15天**：提交申请

如果中间发现Part A的baseline显示这道题对当前模型太简单（不应该发生
但要做好预案），停下来加强约束，**不要用弱题做portfolio**——弱题
反过来会让你的portfolio在Mindrift那边减分。

---

## 附录：术语速查表

| 术语 | 含义 |
|------|------|
| CAI | Codon Adaptation Index，衡量序列像不像高表达基因 |
| tAI | tRNA Adaptation Index，基于tRNA丰度而非mRNA统计 |
| CPB | Codon Pair Bias，相邻两个密码子的联合偏好 |
| MFE | Minimum Free Energy，RNA二级结构最稳定折叠的能量 |
| ΔG | 自由能变化（kcal/mol），结构稳定性的物理量 |
| SD | Shine-Dalgarno序列，原核翻译起始信号 |
| Kozak | 真核翻译起始上下文序列 |
| ORF | Open Reading Frame，开放阅读框 |
| UTR | Untranslated Region，CDS两侧的非编码区 |
| de novo | 从头设计/合成 |
| heterologous expression | 异源表达 |
| in silico | 计算机模拟（区别于in vitro/in vivo） |
