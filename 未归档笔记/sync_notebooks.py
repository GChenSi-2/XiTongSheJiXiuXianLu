"""
sync_notebooks.py
将指定目录下所有 .ipynb 文件转换成 MyST Markdown (.md)
用法: python sync_notebooks.py
      python sync_notebooks.py --dir "C:/Users/user/Desktop/operation system"
      python sync_notebooks.py --no-recursive
"""

import subprocess
import argparse
import sys
import os
from pathlib import Path


def sync_notebooks(root_dir: Path, recursive: bool = True):
    if recursive:
        notebooks = list(root_dir.rglob("*.ipynb"))
    else:
        notebooks = list(root_dir.glob("*.ipynb"))

    # 排除 .ipynb_checkpoints 目录
    notebooks = [nb for nb in notebooks if ".ipynb_checkpoints" not in str(nb)]

    if not notebooks:
        print(f"[INFO] No notebooks found in: {root_dir}")
        return

    print(f"[INFO] Found {len(notebooks)} notebook(s) in: {root_dir}")
    print(f"[INFO] Using Python: {sys.executable}")
    print()

    # 强制 UTF-8 编码，避免日文/中文 Windows 系统的 cp932 编码错误
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"

    success, failed = [], []

    for nb in notebooks:
        # 显示相对路径，便于区分不同子目录的同名文件
        try:
            display_name = nb.relative_to(root_dir)
        except ValueError:
            display_name = nb

        print(f"  Converting: {display_name} ...")
        result = subprocess.run(
            [sys.executable, "-m", "jupytext", "--to", "md", str(nb)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env
        )
        if result.returncode == 0:
            print(f"  ✓ Done: {nb.with_suffix('.md').name}")
            success.append(nb)
        else:
            err_msg = (result.stderr or "").strip().splitlines()
            # 只显示错误的最后一行，更清爽
            last_err = err_msg[-1] if err_msg else "Unknown error"
            print(f"  ✗ Failed: {display_name}")
            print(f"    {last_err}")
            failed.append(nb)

    print()
    print(f"[DONE] Success: {len(success)}  Failed: {len(failed)}")

    if failed:
        print()
        print("[FAILED FILES]")
        for nb in failed:
            print(f"  - {nb}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Batch convert notebooks to MyST Markdown")
    parser.add_argument(
        "--dir",
        type=str,
        default=".",
        help="Target directory (default: current directory)"
    )
    parser.add_argument(
        "--no-recursive",
        action="store_true",
        help="Only convert notebooks in the top-level directory (not subdirectories)"
    )
    args = parser.parse_args()

    root = Path(args.dir).resolve()
    if not root.exists():
        print(f"[ERROR] Directory not found: {root}")
        exit(1)

    sync_notebooks(root, recursive=not args.no_recursive)