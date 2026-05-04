# ngs WSL-backed tools output paths

This note applies to these Windows `ngs` wrappers:

- `C:\Users\user\miniconda3\envs\ngs\Scripts\STAR.cmd`
- `C:\Users\user\miniconda3\envs\ngs\Scripts\samtools.cmd`
- `C:\Users\user\miniconda3\envs\ngs\Scripts\salmon.cmd`
- `C:\Users\user\miniconda3\envs\ngs\Scripts\nextflow.cmd`

These wrappers are launched from Windows, but the actual tools run inside WSL `Ubuntu-24.04`.

## Version commands do not create output files

These commands only print version information to the terminal or Jupyter cell output:

```powershell
STAR --version
samtools --version
salmon --version
nextflow -version
```

They do not create analysis output files.

## Current directory rule

If you start from Windows:

```text
C:\Users\user
```

the WSL-backed command sees the current directory as:

```text
/mnt/c/Users/user
```

So if a tool writes to a relative path such as `out.bam`, the file will normally appear under:

```text
C:\Users\user\out.bam
```

## Windows path through WSL

Use `/mnt/c/...` when you want output to appear in normal Windows folders.

```text
WSL path:     /mnt/c/Users/user/Desktop/results
Windows path: C:\Users\user\Desktop\results
```

Example:

```python
!samtools sort -o /mnt/c/Users/user/Desktop/results/sample.sorted.bam /mnt/c/Users/user/Desktop/data/sample.bam
```

The output file appears at:

```text
C:\Users\user\Desktop\results\sample.sorted.bam
```

## WSL internal path

Use `/home/silicon/...` when you want files to stay inside the Ubuntu filesystem.

```text
WSL path:     /home/silicon/results
Windows path: \\wsl.localhost\Ubuntu-24.04\home\silicon\results
```

Example:

```python
!samtools sort -o /home/silicon/results/sample.sorted.bam /mnt/c/Users/user/Desktop/data/sample.bam
```

The output is stored inside WSL, not in a normal `C:\...` folder.

## Practical recommendation

Use `/mnt/c/Users/user/...` for small files and final reports that you want to inspect from Windows/Jupyter.

Use `/home/silicon/...` for heavy intermediate files, large BAM/FASTQ processing, STAR genome indexes, and Nextflow work directories. This is usually faster and avoids many Windows filesystem edge cases.

You can write final results back to Windows after the heavy processing step.

## Tool-specific examples

### STAR

STAR writes several files using `--outFileNamePrefix`. If no explicit prefix is set, files are written relative to the current directory.

Windows output folder:

```python
!STAR --genomeDir /home/silicon/ref/star_index --readFilesIn /mnt/c/Users/user/data/R1.fq.gz /mnt/c/Users/user/data/R2.fq.gz --readFilesCommand zcat --outFileNamePrefix /mnt/c/Users/user/results/star/sample1_
```

WSL internal output folder:

```python
!STAR --genomeDir /home/silicon/ref/star_index --readFilesIn /mnt/c/Users/user/data/R1.fq.gz /mnt/c/Users/user/data/R2.fq.gz --readFilesCommand zcat --outFileNamePrefix /home/silicon/results/star/sample1_
```

Typical STAR output names include:

```text
sample1_Aligned.out.sam
sample1_Log.out
sample1_Log.final.out
sample1_SJ.out.tab
```

### samtools

Many `samtools` commands write to stdout unless you use `-o` or shell redirection.

Recommended:

```python
!samtools sort -o /mnt/c/Users/user/results/sample.sorted.bam /mnt/c/Users/user/data/sample.bam
```

Index files are often written beside the BAM file:

```python
!samtools index /mnt/c/Users/user/results/sample.sorted.bam
```

This creates:

```text
C:\Users\user\results\sample.sorted.bam.bai
```

### salmon

For `salmon quant`, output is normally set with `-o`.

```python
!salmon quant -i /home/silicon/ref/salmon_index -l A -1 /mnt/c/Users/user/data/R1.fq.gz -2 /mnt/c/Users/user/data/R2.fq.gz -o /mnt/c/Users/user/results/salmon_sample1
```

For large runs, prefer WSL internal output:

```python
!salmon quant -i /home/silicon/ref/salmon_index -l A -1 /mnt/c/Users/user/data/R1.fq.gz -2 /mnt/c/Users/user/data/R2.fq.gz -o /home/silicon/results/salmon_sample1
```

### nextflow

Nextflow creates a work directory and log file relative to the launch directory unless configured otherwise.

Recommended:

```python
!nextflow run <pipeline> -w /home/silicon/nextflow-work --outdir /mnt/c/Users/user/results/nextflow
```

This keeps heavy intermediate work inside WSL and sends final results to Windows.

If you do not set `-w`, Nextflow may create:

```text
C:\Users\user\work
C:\Users\user\.nextflow.log
```

when launched from `C:\Users\user`.

## Check paths from a Jupyter cell

Check the notebook's current Windows directory:

```python
import os
os.getcwd()
```

Convert common Windows paths manually:

```text
C:\Users\user\Desktop\data
```

becomes:

```text
/mnt/c/Users/user/Desktop/data
```

