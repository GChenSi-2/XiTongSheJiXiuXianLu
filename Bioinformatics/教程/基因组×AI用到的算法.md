- **蛋白质语言模型**: ESM3, ProGen3, AlphaFold 3
- **基因组语言模型**: Evo 2, Caduceus, Nucleotide Transformer
- **单细胞基础模型**: scGPT, Geneformer, scFoundation
- **Agent框架**: FutureHouse的Aviary、BixBench的环境配置

补Python的"硬核计算"能力（穿插进行）

招聘要numpy/scipy/biopython是基础。但要出"几天几周才能解"的题，你需要：

- **JAX**：自动微分+JIT+向量化，做参数推断、ODE求解都比SciPy快十倍以上，而且能跟现代ML思路接轨
- **Numba / Cython**：把Python热点函数加速到接近C的水平
- **专业库的熟练**：msprime, tskit (群体遗传); MDAnalysis, OpenMM (分子模拟); scanpy, anndata, scvi-tools (单细胞); pyhmmer, pysam (序列); networkx, graph-tool (网络)
- **数值方法的常识**：ODE/SDE求解器选择、Monte Carlo方法、HMC/MCMC (PyMC, NumPyro)、优化器陷阱

**群体遗传与coalescent推断**。Coalescent simulation (msprime)、Approximate Bayesian Computation、demographic inference (PSMC, SMC++)、selection scan的统计方法。这块属于"理论深+计算重+生信学生通常不熟"的甜区。一道好题：给定SFS和LD pattern，推断一个三群体分化模型的参数置信区间——验证可以通过msprime仿真做。

**结构生物学/分子动力学**。不是简单跑AlphaFold，而是**AlphaFold之后**的难题：构象集合分析、allosteric site预测、PPI界面动力学、自由能计算 (FEP, umbrella sampling)。工具：MDAnalysis、PyMOL脚本、OpenMM。前沿模型现在对静态结构有sense，但对动力学和能量学很弱。

**单细胞与空间组学的算法层**。不是跑Scanpy流程，而是trajectory inference的数学基础、batch effect correction的诊断、RNA velocity的假设边界、空间转录组的统计建模。一道好题：构造一个含confounding的合成scRNA-seq数据集，让模型识别出标准pipeline会犯什么错。

**网络/系统生物学的反问题**。Gene regulatory network inference (ODE-based, Bayesian network)、metabolic flux analysis (COBRApy)、信号通路的参数估计。这些反问题往往是ill-posed的，需要正则化和先验，特别考验推理。