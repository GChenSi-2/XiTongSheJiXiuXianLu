"""
sync_notebooks.py
将指定目录下所有 .ipynb 文件转换成 MyST Markdown (.md)
用法: python sync_notebooks.py
      python sync_notebooks.py --dir "C:/Users/user/Desktop/operation system"
"""

import subprocess
import argparse
from pathlib import Path


def sync_notebooks(root_dir: Path):
    notebooks = list(root_dir.rglob("*.ipynb"))

    # 排除 .ipynb_checkpoints 目录
    notebooks = [nb for nb in notebooks if ".ipynb_checkpoints" not in str(nb)]

    if not notebooks:
        print(f"[INFO] No notebooks found in: {root_dir}")
        return

    print(f"[INFO] Found {len(notebooks)} notebook(s) in: {root_dir}")
    print()

    success, failed = [], []

    for nb in notebooks:
        print(f"  Converting: {nb.name} ...")
        result = subprocess.run(
            ["jupytext", "--to", "myst", str(nb)],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print(f"  ✓ Done: {nb.with_suffix('.md').name}")
            success.append(nb)
        else:
            print(f"  ✗ Failed: {nb.name}")
            print(f"    {result.stderr.strip()}")
            failed.append(nb)

    print()
    print(f"[DONE] Success: {len(success)}  Failed: {len(failed)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Batch convert notebooks to MyST Markdown")
    parser.add_argument(
        "--dir",
        type=str,
        default=".",
        help="Target directory (default: current directory)"
    )
    args = parser.parse_args()

    root = Path(args.dir).resolve()
    if not root.exists():
        print(f"[ERROR] Directory not found: {root}")
        exit(1)

    sync_notebooks(root)
