你现在的 `ngs` 里可用的是：

```text
pysradb   # 查 SRA/GEO metadata、转换编号
fastq-dl  # 下载 FASTQ，默认从 ENA 下载
```

没有官方 SRA Toolkit 的 `prefetch/fasterq-dump`，但入门下载实验数据用这两个更简单。

**核心思路**
SRA/GEO 编号大概这样：

```text
GSE  = GEO 里的一个研究项目
GSM  = GEO 里的样本
SRP  = SRA project/study
SRX  = SRA experiment
SRR  = 具体测序 run，真正下载 FASTQ 通常用这个
```

**1. 如果你有 GSE 编号**

比如你从论文里看到：

```text
GSE123456
```

先转成 SRA 编号：

```powershell
pysradb gse-to-srp GSE123456 --detailed --saveto C:\Users\user\Desktop\sra_metadata.tsv
```

然后打开 `C:\Users\user\Desktop\sra_metadata.tsv`，重点看这些列：

```text
study_accession / SRP
experiment_accession / SRX
run_accession / SRR
sample_alias / GSM
```

**2. 如果你已经有 SRP 编号**

比如：

```text
SRP123456
```

查它下面所有样本和 run：

```powershell
pysradb metadata SRP123456 --detailed --expand --saveto C:\Users\user\Desktop\sra_metadata.tsv
```

**3. 下载某一个 SRR**

最稳妥是先下载单个 SRR 测试：

```powershell
fastq-dl -a SRR12345678 -o C:\Users\user\Desktop\sra_fastq
```

paired-end 数据通常会得到类似：

```text
SRR12345678_1.fastq.gz
SRR12345678_2.fastq.gz
```

single-end 通常是：

```text
SRR12345678.fastq.gz
```

**4. 下载整个项目**

如果确认项目不大，可以直接下载 SRP：

```powershell
fastq-dl -a SRP123456 -o C:\Users\user\Desktop\sra_fastq --group-by-experiment
```

不过整个项目可能很大，我建议先用 metadata 看清楚样本数和测序量，再选 SRR 下载。

**5. 在 Jupyter cell 里写法**

```python
!pysradb metadata SRP123456 --detailed --expand --saveto C:\Users\user\Desktop\sra_metadata.tsv
!fastq-dl -a SRR12345678 -o C:\Users\user\Desktop\sra_fastq
```

注意：`pysradb` 和 `fastq-dl` 是 Windows 侧运行，所以这里用普通 Windows 路径 `C:\Users\user\…`，不是 `/mnt/c/…`。

**下载后接着质控**

```powershell
fastqc C:\Users\user\Desktop\sra_fastq\*.fastq.gz
multiqc C:\Users\user\Desktop\sra_fastq -o C:\Users\user\Desktop\sra_fastq\multiqc
```

你实际要做的时候，最短流程就是：

```powershell
conda activate ngs
pysradb metadata SRP编号 --detailed --expand --saveto C:\Users\user\Desktop\sra_metadata.tsv
fastq-dl -a SRR编号 -o C:\Users\user\Desktop\sra_fastq
fastqc C:\Users\user\Desktop\sra_fastq\*.fastq.gz
multiqc C:\Users\user\Desktop\sra_fastq -o C:\Users\user\Desktop\sra_fastq\multiqc
```