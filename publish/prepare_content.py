#!/usr/bin/env python3
"""Copy only the folders listed in PUBLISH_DIRS (plus the attachments their
notes actually reference) into a Quartz content directory.

Everything else in the vault stays out of the public site. Secrets that look
like tokens/API keys are masked in the copied notes; the originals are untouched.

Usage: python3 publish/prepare_content.py <vault_root> <content_dir>
"""
import os
import re
import shutil
import sys
from pathlib import Path
from urllib.parse import unquote

# ===== 要公开发布的文件夹（相对 vault 根目录）。改这里就能增减 =====
PUBLISH_DIRS = ["Bioinformatics", "AI research", "OSnote"]

# 这些路径片段下的文件一律不发布
EXCLUDE_PARTS = {".ipynb_checkpoints", ".obsidian", ".trash", "__MACOSX", ".git"}

# 被笔记引用、但位于发布文件夹之外时，只允许复制这些类型（防止误带出其他文件）
MEDIA_EXT = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".bmp",
             ".pdf", ".mp3", ".wav", ".mp4", ".webm"}

# 打码规则：(正则, 替换)。只作用于发布出去的副本
REDACTIONS = [
    (re.compile(r"([?&](?:token|access_token|api_key|apikey|key)=)[^\s&)\"'`<>]+", re.I), r"\1***"),
    (re.compile(r"\b(sk-ant-|sk-|ghp_|github_pat_|xox[bap]-)[A-Za-z0-9_\-]{8,}"), r"\1***"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "AKIA***"),
    (re.compile(r"(?im)^(\s*[\"']?(?:api[_-]?key|token|secret|password|passwd)[\"']?\s*[:=]\s*)[\"']?[^\s\"']{8,}[\"']?"), r"\1***"),
]

LITERALS = [s.strip() for s in os.environ.get("REDACT_LITERALS", "").split(",") if len(s.strip()) >= 6]

WIKI_RE = re.compile(r"!?\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]")
MD_LINK_RE = re.compile(r"!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")


def excluded(p: Path) -> bool:
    return any(part in EXCLUDE_PARTS for part in p.parts)


def main() -> None:
    vault = Path(sys.argv[1]).resolve()
    out = Path(sys.argv[2]).resolve()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    # Obsidian 的"最短路径"链接：按文件名建索引，用于解析 ![[foo.png]]
    by_name: dict[str, list[Path]] = {}
    for f in vault.rglob("*"):
        if f.is_file() and not excluded(f.relative_to(vault)):
            by_name.setdefault(f.name.lower(), []).append(f)

    publish_roots = [vault / d for d in PUBLISH_DIRS]
    for r in publish_roots:
        if not r.is_dir():
            sys.exit(f"[prepare] 找不到要发布的文件夹: {r}")

    def in_publish(f: Path) -> bool:
        return any(f == r or r in f.parents for r in publish_roots)

    def resolve(target: str, note: Path) -> Path | None:
        target = unquote(target.strip())
        if not target or re.match(r"^[a-z]+://|^mailto:|^#", target, re.I):
            return None
        for cand in (note.parent / target, vault / target):
            if cand.is_file():
                return cand.resolve()
        hits = by_name.get(Path(target).name.lower())
        if hits:  # 多个同名时取路径最短的，和 Obsidian 一致
            return sorted(hits, key=lambda p: len(p.parts))[0].resolve()
        return None

    notes, attachments, masked = 0, set(), 0
    for root in publish_roots:
        for md in root.rglob("*.md"):
            rel = md.relative_to(vault)
            if excluded(rel):
                continue
            text = md.read_text(encoding="utf-8", errors="replace")
            for target in WIKI_RE.findall(text) + MD_LINK_RE.findall(text):
                f = resolve(target, md)
                if not f or f.suffix.lower() == ".md" or excluded(f.relative_to(vault)):
                    continue
                if in_publish(f) or f.suffix.lower() in MEDIA_EXT:
                    attachments.add(f)
            for rx, rep in REDACTIONS:
                text, n = rx.subn(rep, text)
                masked += n
            # 无固定格式的密钥（比如自己设的 token）：在 Cloudflare Pages 的环境变量
            # REDACT_LITERALS 里用逗号分隔列出，构建时逐个打码
            for lit in LITERALS:
                masked += text.count(lit)
                text = text.replace(lit, "***")
            dest = out / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(text, encoding="utf-8")
            notes += 1

    for f in sorted(attachments):
        dest = out / f.relative_to(vault)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, dest)

    index = out / "index.md"
    if not index.exists():
        # Quartz 把路径里的空格转成 "-"，文件夹页的地址形如 /AI-research/
        links = "\n".join(f"- [{d}](./{d.replace(' ', '-')}/)" for d in PUBLISH_DIRS)
        index.write_text(
            "---\ntitle: Silicon 的笔记\n---\n\n"
            "这里是我公开的学习笔记。\n\n" + links + "\n",
            encoding="utf-8",
        )

    print(f"[prepare] notes={notes} attachments={len(attachments)} masked_secrets={masked}")


if __name__ == "__main__":
    main()
