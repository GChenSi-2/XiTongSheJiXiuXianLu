```markdown
# Issue 修复报告：Anaconda Navigator / Toolbox 启动异常

## 背景

用户已在 `conda base` 中升级 Anaconda 相关组件，但桌面 Navigator 仍显示旧版本，并且通过 Navigator 启动 Anaconda Toolbox / JupyterLab 时出现启动失败。

## 主要症状

启动 Toolbox / JupyterLab 时出现错误：

```text
psutil.AccessDenied: (pid=xxxxx)
PermissionError: [WinError 5] Access is denied: '(originated from OpenProcess)'
```

同时发现 `jupyter server` 命令会错误分发到 Miniconda：

```text
C:\Users\user\miniconda3\Scripts\jupyter-server.exe
```

## 根因

1. `anaconda-navigator` 仍是 `2.6.6`，未升级到目标版本。
2. `anaconda-toolbox / aext-*` 组件较旧，为 `4.26.1`。
3. `nb_conda_kernels` 在 Windows 上清理子进程时没有捕获 `psutil.AccessDenied`，导致 JupyterLab 初始化崩溃。
4. PATH 中缺少 `C:\Users\user\anaconda3\Scripts` 的优先位置，导致 `jupyter server` 被分发到 Miniconda。

## 已执行修复

### 1. 升级 Anaconda Navigator / Toolbox

已升级：

```text
anaconda-navigator: 2.6.6 -> 2.7.0
anaconda-toolbox:   4.26.1 -> 4.40.0
aext-*:             4.26.1 -> 4.40.0
navigator-updater:  0.5.1 -> 0.6.0
```

### 2. 修复 nb_conda_kernels Windows 权限异常

修改文件：

```text
C:\Users\user\anaconda3\Lib\site-packages\nb_conda_kernels\manager.py
```

将异常捕获从：

```python
except psutil.TimeoutExpired:
    pass
```

改为：

```python
except (psutil.TimeoutExpired, psutil.AccessDenied, psutil.NoSuchProcess):
    pass
```

备份文件：

```text
C:\Users\user\anaconda3\Lib\site-packages\nb_conda_kernels\manager.py.bak-before-codex-20260502
```

### 3. 修复 Jupyter 命令分发到 Miniconda 的问题

将真实桌面用户 `C:\Users\user` 的用户级 PATH 修正为：

```text
%USERPROFILE%\anaconda3\Scripts;
%USERPROFILE%\anaconda3\condabin;
%USERPROFILE%\AppData\Local\Microsoft\WindowsApps;
```

验证后：

```text
C:\Users\user\anaconda3\Scripts\jupyter.exe
C:\Users\user\anaconda3\Scripts\jupyter-server.exe
```

## 验证结果

已验证：

```text
anaconda-navigator 2.7.0
aext-toolbox 4.40.0
aext-core 4.40.0
nb-conda-kernels 2.5.2
jupyter-server 2.14.1
```

JupyterLab / Toolbox 启动日志显示：

```text
aext_toolbox | extension was successfully loaded
nb_conda_kernels | enabled, 3 kernels found
Jupyter Server 2.14.1 is running at: http://localhost:8899/lab
```

原始错误 `psutil.AccessDenied` 未再出现。

## 影响范围

未删除任何 conda 环境。  
未删除 Miniconda。  
仅升级了 `C:\Users\user\anaconda3` 的 base 相关组件，并调整了用户级 PATH 顺序。

## 注意事项

以后如果重新安装或更新 `nb_conda_kernels`，可能会覆盖 `manager.py` 中的兼容补丁。如果同样错误复发，需要重新加入：

```python
except (psutil.TimeoutExpired, psutil.AccessDenied, psutil.NoSuchProcess):
    pass
```

## 最终状态

问题已修复。Navigator 已升级到 `2.7.0`，Anaconda Toolbox / JupyterLab 可以正常启动，且 `jupyter server` 不再错误分发到 Miniconda。
```