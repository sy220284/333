#!/usr/bin/env bash
set -euo pipefail
# 拒绝仅因打包成功就判定可用：在移动后的独立位置真实执行 Node/Bun/Python/actionlint。
TOOLCHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$TOOLCHAIN_DIR/toolchain-versions.env"
ARTIFACTS_DIR="${1:-}"
[ -n "$ARTIFACTS_DIR" ] && [ -d "$ARTIFACTS_DIR" ] || { echo "缺少 Artifact 目录" >&2; exit 2; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
for comp in node bun python actionlint; do
  dir="$ARTIFACTS_DIR/333-toolchain-$comp-latest"
  [ -f "$dir/payload.tar.gz" ] || { echo "缺少 $comp" >&2; exit 2; }
  (cd "$dir" && sha256sum -c SHA256SUMS)
  tar -xzf "$dir/payload.tar.gz" -C "$WORK"
done
[ "$("$WORK/node/bin/node" -p 'process.versions.node')" = "$NODE_VERSION" ]
PATH="$WORK/node/bin:$PATH" "$WORK/node/bin/npm" --version >/dev/null
[ "$("$WORK/bun/bin/bun" --version)" = "$BUN_VERSION" ]
env -u PYTHONHOME LD_LIBRARY_PATH="$WORK/python/lib" "$WORK/python/bin/python3" -c 'import ssl,hashlib,json,sys; assert sys.version_info >= (int(sys.argv[1]),int(sys.argv[2]))' "$PYTHON_MAJOR" "$PYTHON_MINOR"
"$WORK/bin/actionlint" -version | grep -F "$ACTIONLINT_VERSION"
echo '[333-toolchain] 已验证全部四类离线运行时组件可执行'
