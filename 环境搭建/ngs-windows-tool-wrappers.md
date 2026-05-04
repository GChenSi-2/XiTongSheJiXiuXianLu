## Ngs Windows Tool Wrappers

Environment: `C:\Users\user\miniconda3\envs\ngs`

### Installed Native Windows Tools

| Tool               | Wrapper                                                            | Binary location                                                                        | Verified version           |
| ------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------- |
| bowtie2            | `C:\Users\user\miniconda3\envs\ngs\Scripts\bowtie2.cmd`            | `C:\Users\user\miniconda3\envs\ngs\opt\bowtie2-2.5.5\bowtie2-2.5.5-mingw-x86_64`       | 2.5.5                      |
| bowtie2-build      | `C:\Users\user\miniconda3\envs\ngs\Scripts\bowtie2-build.cmd`      | same as bowtie2                                                                        | 2.5.5                      |
| bowtie2-inspect    | `C:\Users\user\miniconda3\envs\ngs\Scripts\bowtie2-inspect.cmd`    | same as bowtie2                                                                        | 2.5.5                      |
| hisat2             | `C:\Users\user\miniconda3\envs\ngs\Scripts\hisat2.cmd`             | `C:\Users\user\miniconda3\envs\ngs\opt\hisat2-windows\hisat2`                          | 2.0.4                      |
| hisat2-build       | `C:\Users\user\miniconda3\envs\ngs\Scripts\hisat2-build.cmd`       | same as hisat2                                                                         | 2.0.4                      |
| hisat2-inspect     | `C:\Users\user\miniconda3\envs\ngs\Scripts\hisat2-inspect.cmd`     | same as hisat2                                                                         | 2.0.4                      |
| kallisto           | `C:\Users\user\miniconda3\envs\ngs\Scripts\kallisto.cmd`           | `C:\Users\user\miniconda3\envs\ngs\opt\kallisto-v0.51.1\kallisto\kallisto.exe`         | 0.51.1                     |
| featureCounts      | `C:\Users\user\miniconda3\envs\ngs\Scripts\featureCounts.cmd`      | `C:\Users\user\miniconda3\envs\ngs\opt\subread-2.1.1\subread-2.1.1-Windows-x86_64\bin` | 2.1.1                      |
| subread-align      | `C:\Users\user\miniconda3\envs\ngs\Scripts\subread-align.cmd`      | same as featureCounts                                                                  | 2.1.1                      |
| subread-buildindex | `C:\Users\user\miniconda3\envs\ngs\Scripts\subread-buildindex.cmd` | same as featureCounts                                                                  | bundled with Subread 2.1.1 |

### Downloaded Source URLs

| Tool | URL |
| --- | --- |
| bowtie2 | `https://github.com/BenLangmead/bowtie2/releases/download/v2.5.5/bowtie2-2.5.5-mingw-x86_64.zip` |
| kallisto | `https://github.com/pachterlab/kallisto/releases/download/v0.51.1/kallisto_windows-v0.51.1.tar.gz` |
| featureCounts/subread | `https://downloads.sourceforge.net/project/subread/subread-2.1.1/subread-2.1.1-Windows-x86_64.zip` |
| hisat2 | `http://www.di.fc.ul.pt/~afalcao/hisat2_windows_binaries.zip` |

### Not Installed as Native Windows Wrappers

| Tool | Reason |
| --- | --- |
| STAR | Latest GitHub release asset is `STAR_2.7.11b.zip`, but it is not a native Windows binary package. |
| samtools | Latest official GitHub release provides source archive only, not a native Windows executable asset. |
| salmon | Official documentation says Salmon is currently unsupported on Windows; latest GitHub assets are Linux/macOS only. |
| nextflow | Official documentation supports Windows through WSL, not as a native Windows command-line binary. |

### WSL-backed Wrappers

These tools are installed in `Ubuntu-24.04` under the Linux user `silicon` and are exposed through Windows `.cmd` wrappers in the `ngs` environment.

Linux runner: `/home/silicon/.local/bin/ngs-wsl-run`

Linux environment: `/home/silicon/.local/share/ngs-wsl-tools/envs/ngs-linux`

| Tool | Windows wrapper | WSL command | Verified version |
| --- | --- | --- | --- |
| STAR | `C:\Users\user\miniconda3\envs\ngs\Scripts\STAR.cmd` | `STAR` | 2.7.11b |
| samtools | `C:\Users\user\miniconda3\envs\ngs\Scripts\samtools.cmd` | `samtools` | 1.23.1 |
| salmon | `C:\Users\user\miniconda3\envs\ngs\Scripts\salmon.cmd` | `salmon` | 1.11.4 |
| nextflow | `C:\Users\user\miniconda3\envs\ngs\Scripts\nextflow.cmd` | `nextflow` | 26.04.0 |

The wrappers call `wsl.exe -d Ubuntu-24.04 -- /home/silicon/.local/bin/ngs-wsl-run <tool> %*`.

Use `/mnt/c/…` paths when passing Windows files into these WSL-backed tools.
