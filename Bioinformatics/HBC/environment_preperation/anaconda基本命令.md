


```bash
conda update -n base -c conda-forge conda
mamba update -n base -c conda-forge conda
conda --version
```
查看所有 conda 环境：

```bash
conda env list
conda info --envs
```
查看Jupyter已注册的所有kernel
```
jupyter kernelspec list
```
清理失效的 kernel：
```
jupyter kernelspec remove ir
```
能看到、能选到，但"用哪个 Python/R"是**固定死的**，不会跟着你当前激活的环境变。

用户级kernel是所有环境都能用么

具体来说：用户级 kernel 的注册文件（`kernel.json`）里写死了一个具体的解释器路径（比如 `anaconda3\envs\r-lab\python.exe`）。不管你启动 Jupyter 时激活的是哪个环境，只要 Jupyter 本身能扫到 `AppData\Roaming\jupyter\kernels` 这个目录（它总是能扫到），这个 kernel 就会出现在选择列表里，点击就能用。

但它运行时用的**还是注册时指定的那个固定环境**的 Python/R，跟你启动 Jupyter 时激活了哪个 conda 环境没有关系。举例：你注册了一个叫 `r-lab` 的 kernel，指向 `envs\r-lab\python.exe`；哪怕你现在激活的是 `base` 环境启动的 Jupyter，选这个 kernel 跑代码时，用的依然是 `r-lab` 环境里的包和 Python 版本。

所以准确说法是："全局可见、全局可选"，但"每个 kernel 各自绑定固定的环境"，不是说选了某个 kernel 就会临时借用你当前激活环境的东西。

进入jupyter
```bash
jupyter server list
```
升级jupyter
```
mamba update -n base jupyter jupyterlab -c conda-forge
```

清理僵尸server
```
del C:\Users\user\AppData\Roaming\jupyter\runtime\*.json
del C:\Users\user\AppData\Roaming\jupyter\runtime\*.html
```

创建R环境


清理python或者conda进程

```bash
taskkill /F /IM conda.exe
taskkill /F /IM python.exe
```
手动打开conda配置文件
```
notepad C:\Users\user\.condarc
```

```bash
mamba config list
```

关于三个配置文件
**关于三个配置文件要不要都留着 —— 都留,不用删:**

1. **`C:\Users\user\.condarc`**(用户级)——最主要的配置文件,你平时改设置就改这个,必须留。
2. **`anaconda3\condarc.d\anaconda-auth.yml`**——文件开头写了"DO NOT EDIT",是 anaconda-auth 插件自动生成、用来管理 `repo.anaconda.cloud` 认证渠道的,跟 Anaconda Navigator/Toolbox 的登录功能有关。别手动改它,留着就行。
3. **`anaconda3\.condarc`**(安装目录级)——是 Anaconda 安装时自带的默认渠道配置(只有 pkgs/main、pkgs/r、pkgs/msys2,没有 conda-forge)。它跟你的用户级配置会**合并**使用,不会互相覆盖冲突,只是显得有点冗余(两边都定义了部分相同渠道)。不影响功能,不需要删。
重装conda
```
mamba install -n base -c defaults conda conda-libmamba-solver --force-reinstall -y
```

启动anaconda-navigator
```bash
anaconda-navigator
```
让windows支持长字符路劲
```
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -Type DWord
```
