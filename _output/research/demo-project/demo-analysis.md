# 三工具联动 Demo：数据分析示例
研究者
2026-04-28

- [概述](#概述)
- [基础数据分析](#基础数据分析)
- [数据处理示例](#数据处理示例)
- [结论](#结论)

## 概述

这是一个演示 **Obsidian × Jupyter × Quarto** 联动的示例文档。

- 在 **JupyterLab** 里运行代码
- 用 **Quarto** 渲染成 Markdown
- 在 **Obsidian** 里查看结果和笔记

------------------------------------------------------------------------

## 基础数据分析

``` python
import statistics

# 模拟一组实验数据
data = [23, 45, 12, 67, 34, 89, 56, 78, 42, 31]

print(f"样本数量：{len(data)}")
print(f"均值：{statistics.mean(data):.2f}")
print(f"中位数：{statistics.median(data)}")
print(f"标准差：{statistics.stdev(data):.2f}")
print(f"最大值：{max(data)}")
print(f"最小值：{min(data)}")
```

    样本数量：10
    均值：47.70
    中位数：43.5
    标准差：24.62
    最大值：89
    最小值：12

------------------------------------------------------------------------

## 数据处理示例

``` python
# 数据排序和分组
sorted_data = sorted(data)
low  = [x for x in sorted_data if x < 40]
mid  = [x for x in sorted_data if 40 <= x < 70]
high = [x for x in sorted_data if x >= 70]

print("低值组（<40）：", low)
print("中值组（40-70）：", mid)
print("高值组（≥70）：", high)
```

    低值组（<40）： [12, 23, 31, 34]
    中值组（40-70）： [42, 45, 56, 67]
    高值组（≥70）： [78, 89]

------------------------------------------------------------------------

## 结论

``` python
# 汇总表格
groups = {"低值（<40）": low, "中值（40-70）": mid, "高值（≥70）": high}
print(f"{'分组':<12} {'数量':>6} {'均值':>8}")
print("-" * 28)
for name, grp in groups.items():
    mean = round(statistics.mean(grp), 1) if grp else "N/A"
    print(f"{name:<12} {len(grp):>6} {str(mean):>8}")
```

    分组               数量       均值
    ----------------------------
    低值（<40）           4       25
    中值（40-70）         4     52.5
    高值（≥70）           2     83.5

> 本文档由 Quarto 渲染，结果自动同步到 Obsidian vault。
