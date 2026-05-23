# WSL2 生物信息分析环境搭建指南

---

## 1. 检查并安装 WSL2

在 **Windows PowerShell（管理员）** 中执行：

```powershell
# 查看 WSL 状态和已安装的发行版
wsl --status
wsl -l -v
```

如果输出中看到 `VERSION 2` 和你的 Ubuntu-24.04，说明已经就绪。  
如果没装或版本是 1，执行：

```powershell
# 安装 WSL2（Windows 10 2004+ / Windows 11）
wsl --install

# 如果已经有 Ubuntu 但版本是 1，升级到 2：
wsl --set-version Ubuntu-24.04 2

# 确保默认版本为 2
wsl --set-default-version 2
```

重启电脑后生效。

---

## 2. 在 WSL2 (Ubuntu 24.04) 中安装 Miniforge

打开 Ubuntu 终端（在 Windows 搜索栏输入 `Ubuntu` 或 `wsl`）：

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装基础依赖
sudo apt install -y curl wget git build-essential default-jdk

# 下载 Miniforge（最新版，arm64/x86_64 自动适配）
curl -L -O "https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-$(uname)-$(uname -m).sh"

# 安装（-b 静默安装，-p 指定路径）
bash Miniforge3-$(uname)-$(uname -m).sh -b -p $HOME/miniforge3

# 初始化 shell
~/miniforge3/bin/conda init bash

# 重新加载 shell
source ~/.bashrc

# 验证安装
conda --version
mamba --version
```

> **Miniforge 自带 mamba，且默认 channel 就是 conda-forge，不用额外配置。**

---

## 3. 配置 Conda：bioconda channel + mamba 默认

```bash
# 添加 bioconda channel（顺序很重要，优先级从低到高）
conda config --add channels bioconda
conda config --set channel_priority strict

# 验证 channel 配置
conda config --show channels
# 应该看到：
#   - conda-forge
#   - bioconda
#   - defaults

# Miniforge 已自带 mamba，直接用 mamba 替代 conda 即可
# 建议在 .bashrc 中加一个 alias 强化习惯：
echo 'alias conda="mamba"' >> ~/.bashrc
source ~/.bashrc
```

从此以后，所有 `conda install`、`conda create` 命令都会自动走 mamba 解析器，速度提升 10-50 倍。

---

## 4. 创建数据目录

```bash
# 创建数据存放目录（在 WSL 原生文件系统中，I/O 性能最佳）
mkdir -p /home/silicon/data
mkdir -p /home/silicon/data/raw        # 原始测序数据（FASTQ 等）
mkdir -p /home/silicon/data/reference  # 参考基因组
mkdir -p /home/silicon/data/results    # 分析结果
mkdir -p /home/silicon/data/tmp        # 临时文件

# 确认目录结构
tree /home/silicon/data 2>/dev/null || ls -R /home/silicon/data
```

> ⚠️ **重要提醒**：不要把数据放在 `/mnt/c/` 或 `/mnt/d/` 下面。  
> 跨文件系统 I/O 会慢 5-10 倍，跑 BAM/FASTQ 的时候差距更大。  
> 如果需要从 Windows 复制文件进来，用 `cp /mnt/c/Users/你的用户名/Downloads/xxx.fastq.gz /home/silicon/data/raw/`

---

## 5. 安装 Nextflow

```bash
# Nextflow 依赖 Java 11+（前面已安装 default-jdk）
java -version

# 安装 Nextflow
curl -s https://get.nextflow.io | bash

# 移动到 PATH 中
sudo mv nextflow /usr/local/bin/

# 验证
nextflow -version

# （可选）启用 DSL2 并设置默认工作目录
mkdir -p /home/silicon/.nextflow
cat >> ~/.bashrc << 'EOF'

# Nextflow 配置
export NXF_HOME=/home/silicon/.nextflow
export NXF_WORK=/home/silicon/data/tmp/nextflow_work
export NXF_SINGULARITY_CACHEDIR=/home/silicon/.singularity/cache
EOF
source ~/.bashrc
```

### 可选：安装容器引擎（推荐 Docker）

Nextflow 的 nf-core 流程推荐用容器来保证环境一致性：

```bash
# 方案 A：用 Windows 的 Docker Desktop（推荐，最省事）
# 在 Docker Desktop 设置中勾选 "Use the WSL 2 based engine"
# 并在 Resources > WSL Integration 中启用 Ubuntu-24.04
# 然后在 WSL 中验证：
docker --version

# 方案 B：直接在 WSL 中装 Docker Engine
sudo apt install -y docker.io
sudo usermod -aG docker $USER
# 注销重新登录后生效
```

---

## 6. Nextflow 快速入门指南

### 核心概念

| 概念 | 说明 |
|------|------|
| **Process** | 一个独立的计算步骤（如 FASTQC、BWA 比对） |
| **Channel** | 进程之间的数据管道，连接输入和输出 |
| **Workflow** | 将多个 Process 串联成完整流程 |
| **DSL2** | 当前标准语法，支持模块化和函数复用 |

### 最简示例

创建一个文件 `hello.nf`：

```groovy
#!/usr/bin/env nextflow

// DSL2 是默认模式（Nextflow 22.04+）

process SAYHELLO {
    input:
    val sample_name

    output:
    stdout

    script:
    """
    echo "Hello, ${sample_name}! Welcome to bioinformatics."
    """
}

workflow {
    // 创建一个 channel
    samples = Channel.of('SampleA', 'SampleB', 'SampleC')

    // 调用 process
    SAYHELLO(samples) | view
}
```

运行：

```bash
nextflow run hello.nf
```

### 实际生信示例：FASTQ 质控

```groovy
#!/usr/bin/env nextflow

params.reads = "/home/silicon/data/raw/*_{1,2}.fastq.gz"
params.outdir = "/home/silicon/data/results/fastqc"

process FASTQC {
    // 用 conda 自动创建隔离环境
    conda 'bioconda::fastqc=0.12.1'

    publishDir params.outdir, mode: 'copy'

    input:
    tuple val(sample_id), path(reads)

    output:
    path "*.html"
    path "*.zip"

    script:
    """
    fastqc -t 2 ${reads}
    """
}

workflow {
    read_pairs = Channel.fromFilePairs(params.reads)
    FASTQC(read_pairs)
}
```

运行：

```bash
nextflow run fastqc.nf --reads '/home/silicon/data/raw/*_{1,2}.fastq.gz'
```

### Nextflow 常用命令速查

```bash
# 运行流程
nextflow run <script.nf>

# 从 GitHub 直接运行
nextflow run nf-core/rnaseq -profile docker --input samplesheet.csv --outdir results

# 查看可用的 nf-core 流程
nextflow run nf-core/rnaseq --help

# 恢复中断的运行（从上次断点继续）
nextflow run <script.nf> -resume

# 查看运行日志
nextflow log

# 清理工作目录
nextflow clean -f
```

---

## 7. 查找和下载常用生信分析流程

### nf-core：生信 Nextflow 流程的标准仓库

[nf-core](https://nf-co.re/) 是最重要的生信 Nextflow 流程集合，所有流程都经过严格审核、持续维护、支持容器化。

```bash
# 安装 nf-core CLI 工具
mamba install -y nf-core

# 列出所有可用流程
nf-core list

# 搜索特定关键词
nf-core list --search rnaseq
nf-core list --search variant
```

### 常用流程一览

| 流程 | 用途 | 运行命令 |
|------|------|----------|
| **nf-core/rnaseq** | RNA-Seq 全流程（QC→比对→定量） | `nextflow run nf-core/rnaseq` |
| **nf-core/sarek** | 全基因组/外显子变异检测（GATK） | `nextflow run nf-core/sarek` |
| **nf-core/chipseq** | ChIP-Seq 峰值检测 | `nextflow run nf-core/chipseq` |
| **nf-core/atacseq** | ATAC-Seq 染色质可及性分析 | `nextflow run nf-core/atacseq` |
| **nf-core/methylseq** | 甲基化测序分析 | `nextflow run nf-core/methylseq` |
| **nf-core/viralrecon** | 病毒基因组分析（含 SARS-CoV-2） | `nextflow run nf-core/viralrecon` |
| **nf-core/scrnaseq** | 单细胞 RNA-Seq | `nextflow run nf-core/scrnaseq` |
| **nf-core/fetchngs** | 自动下载 SRA/ENA/GEO 数据 | `nextflow run nf-core/fetchngs` |
| **nf-core/mag** | 宏基因组组装与分箱 | `nextflow run nf-core/mag` |
| **nf-core/ampliseq** | 16S/ITS 扩增子测序 | `nextflow run nf-core/ampliseq` |

### 下载流程（离线使用）

```bash
# 下载流程及其所有依赖（包括容器镜像）
nf-core download rnaseq

# 指定版本下载
nf-core download rnaseq --revision 3.14.0

# 下载时包含 Singularity 镜像（HPC 环境常用）
nf-core download rnaseq --container-system singularity
```

### 运行一个完整流程的标准步骤

```bash
# 以 RNA-Seq 为例：

# 1. 查看流程帮助
nextflow run nf-core/rnaseq --help

# 2. 准备 samplesheet（CSV 格式）
cat > samplesheet.csv << 'EOF'
sample,fastq_1,fastq_2,strandedness
CONTROL_1,/home/silicon/data/raw/ctrl1_R1.fastq.gz,/home/silicon/data/raw/ctrl1_R2.fastq.gz,auto
CONTROL_2,/home/silicon/data/raw/ctrl2_R1.fastq.gz,/home/silicon/data/raw/ctrl2_R2.fastq.gz,auto
TREATED_1,/home/silicon/data/raw/treat1_R1.fastq.gz,/home/silicon/data/raw/treat1_R2.fastq.gz,auto
EOF

# 3. 运行（用 Docker）
nextflow run nf-core/rnaseq \
    --input samplesheet.csv \
    --outdir /home/silicon/data/results/rnaseq \
    --genome GRCh38 \
    -profile docker \
    -resume

# 4. 查看结果
ls /home/silicon/data/results/rnaseq/
# multiqc/ → 综合质控报告（浏览器打开 multiqc_report.html）
# star_salmon/ → 比对和定量结果
# fastqc/ → 原始数据质控
```

---

## 环境验证清单

全部装完后，运行以下命令确认一切正常：

```bash
echo "=== WSL 版本 ==="
cat /etc/os-release | head -3

echo "=== Conda/Mamba ==="
conda --version
mamba --version

echo "=== Channels ==="
conda config --show channels

echo "=== Java ==="
java -version

echo "=== Nextflow ==="
nextflow -version

echo "=== nf-core ==="
nf-core --version

echo "=== Docker ==="
docker --version 2>/dev/null || echo "Docker 未安装（可选）"

echo "=== 数据目录 ==="
ls /home/silicon/data/
```
