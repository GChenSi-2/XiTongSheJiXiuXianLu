#!/usr/bin/env bash
# 构建 notes.silicon.fyi（Cloudflare Pages 的构建命令：bash publish/build.sh，输出目录：public）
# 只发布 publish/prepare_content.py 里 PUBLISH_DIRS 列出的文件夹。
set -euo pipefail

QUARTZ_VERSION="v4.5.2"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/.quartz-build"

if [ -z "${REDACT_LITERALS:-}" ]; then
  echo "[build] ERROR: 没有设置环境变量 REDACT_LITERALS（要打码的密钥，逗号分隔；确实没有就填 NONE）" >&2
  exit 1
fi

rm -rf "$WORK" "$ROOT/public"
git clone --quiet --depth 1 --branch "$QUARTZ_VERSION" https://github.com/jackyzha0/quartz.git "$WORK"

python3 "$ROOT/publish/prepare_content.py" "$ROOT" "$WORK/content"
cp "$ROOT/publish/quartz.config.ts" "$WORK/quartz.config.ts"

cd "$WORK"
npm ci --no-audit --no-fund
npx quartz build --directory content --output "$ROOT/public"

# 安全闸：REDACT_LITERALS 里的任何一个值如果还出现在网站里，直接让构建失败，不发布
IFS=',' read -ra LITS <<< "${REDACT_LITERALS:-}"
for lit in "${LITS[@]}"; do
  lit="$(echo "$lit" | xargs)"
  [ ${#lit} -ge 6 ] || continue
  if grep -rqF -- "$lit" "$ROOT/public"; then
    echo "[build] ERROR: 发现未打码的密钥，已中止发布" >&2
    exit 1
  fi
done

echo "[build] done:$(find "$ROOT/public" -name '*.html' | wc -l) html pages"
