@echo off
chcp 65001 >nul
REM ==================================================================
REM Launch JupyterLab via Miniconda3 base (FORCED - absolute path)
REM root_dir = C:\Users\user\Desktop\operation system
REM ==================================================================

REM ---- 1. Activate conda base ----
call "C:\Users\user\miniconda3\Scripts\activate.bat" base
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to activate conda base.
    echo.
    pause
    exit /b 1
)

REM ---- 2. Verify activation actually worked ----
if not defined CONDA_PREFIX (
    echo [ERROR] CONDA_PREFIX not set - activation broken.
    pause
    exit /b 1
)

echo Active env:    %CONDA_DEFAULT_ENV%
echo CONDA_PREFIX:  %CONDA_PREFIX%
echo.

REM ---- 3. Verify jupyter exists INSIDE this env (not anywhere else) ----
if not exist "%CONDA_PREFIX%\Scripts\jupyter.exe" (
    echo [ERROR] jupyter is NOT installed in this env.
    echo Expected: %CONDA_PREFIX%\Scripts\jupyter.exe
    echo.
    echo Install with:
    echo     conda install -n base jupyter jupyterlab ipykernel
    echo or:
    echo     pip install jupyter jupyterlab ipykernel -i https://pypi.tuna.tsinghua.edu.cn/simple
    echo.
    pause
    exit /b 1
)

echo Using jupyter: %CONDA_PREFIX%\Scripts\jupyter.exe
echo Python:        %CONDA_PREFIX%\python.exe
echo.
echo ==================================================================
echo  Starting JupyterLab
echo  root_dir = C:\Users\user\Desktop\operation system
echo ==================================================================
echo.

REM ---- 4. Launch with ABSOLUTE PATH - guarantees we use base's jupyter ----
"%CONDA_PREFIX%\Scripts\jupyter.exe" lab --ServerApp.root_dir="C:\Users\user\Desktop\operation system"

pause
