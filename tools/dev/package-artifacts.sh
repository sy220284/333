#!/usr/bin/env bash
# 仅在 GitHub Actions 运行；对已验证的本机运行时及恢复依赖制作可离线复用的组件。
set -euo pipefail
TOOLCHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$TOOLCHAIN_DIR/lib.sh"
load_manifest
detect_arch
require_repo
for c in node bun npm-public source-deps python actionlint; do
  component_ready "$c" || die "打包前未通过组件检测：$c"
done
OUT="${1:-}"
[ -n "$OUT" ] && [ "$OUT" != / ] || die "用法: bash tools/dev/package-artifacts.sh OUTPUT_DIR"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
PUBLIC_LOCK_SHA256="$(repo_lock_hash)"
new_stage() {
  local path="$STAGE/$1"
  mkdir -p "$path"
  echo "$path"
}
make_component() {
  local name="$1" src="$2" count i archive prefix dir file n
  count="$(component_parts "$name")"
  archive="$STAGE/$name.tar.gz"
  tar -C "$src" -czf "$archive" .
  if [ "$count" -eq 1 ]; then
    dir="$OUT/333-toolchain-$name-latest"
    mkdir -p "$dir"
    cp "$archive" "$dir/payload.tar.gz"
    printf '%s\n' "$dir" > "$STAGE/dirs-$name"
  else
    prefix="$STAGE/$name.part."
    split -b "$TOOLCHAIN_SHARD_BYTES" -d -a 2 "$archive" "$prefix"
    n="$(find "$STAGE" -maxdepth 1 -name "$name.part.*" | wc -l)"
    [ "$n" -le "$count" ] || die "$name 超过 $count 个分片，调整 NPM_PUBLIC_PARTS"
    for ((i=1; i<=count; i++)); do
      printf -v dir '%s/333-toolchain-%s-part-%02d-latest' "$OUT" "$name" "$i"
      mkdir -p "$dir"
      printf -v file '%s%02d' "$prefix" "$((i-1))"
      if [ -f "$file" ]; then cp "$file" "$dir/payload.part"; else : > "$dir/payload.part"; fi
      echo "$dir" >> "$STAGE/dirs-$name"
    done
  fi
  i=1
  while IFS= read -r dir; do
    cat > "$dir/component.env" <<EOF
ARTIFACT_SCHEMA=$ARTIFACT_SCHEMA
ARTIFACT_COMPONENT=$name
ARTIFACT_ARCH=$ARCH_KIND
ARTIFACT_PART=$i
ARTIFACT_PARTS=$count
NODE_MAJOR=$NODE_MAJOR
BUN_VERSION=$BUN_VERSION
PYTHON_MAJOR=$PYTHON_MAJOR
PYTHON_MINOR=$PYTHON_MINOR
ACTIONLINT_VERSION=$ACTIONLINT_VERSION
SOURCE_MAP_SHA256=$SOURCE_MAP_SHA256
PUBLIC_LOCK_SHA256=$PUBLIC_LOCK_SHA256
EOF
    (cd "$dir"; sha256sum component.env payload.* > SHA256SUMS; sha256sum -c SHA256SUMS)
    if [ "$(du -sb "$dir" | awk '{print $1}')" -gt 524288000 ]; then
      die "超出 500 MiB 组件上限：$dir"
    fi
    i=$((i+1))
  done < "$STAGE/dirs-$name"
  say "已制作 $name，共 $count 个分片"
}
# 不打包原发行程序 cli.js，亦不打包 Android、Gradle 或 JDK。
NODE_STAGE="$(new_stage node)"
NODE_BIN="$(readlink -f "$(node_path)")"
NODE_HOME="$(cd "$(dirname "$NODE_BIN")/.." && pwd)"
cp -a "$NODE_HOME" "$NODE_STAGE/node"
make_component node "$NODE_STAGE"

BUN_STAGE="$(new_stage bun)"
mkdir -p "$BUN_STAGE/bun/bin"
cp "$(bun_path)" "$BUN_STAGE/bun/bin/bun"
chmod +x "$BUN_STAGE/bun/bin/bun"
make_component bun "$BUN_STAGE"

PUBLIC_STAGE="$(new_stage npm-public)"
cp -a "$REPO_ROOT/.rebuild/public" "$PUBLIC_STAGE/public"
make_component npm-public "$PUBLIC_STAGE"

SNAPSHOT_STAGE="$(new_stage source-deps)"
cp -a "$REPO_ROOT/.rebuild/deps" "$SNAPSHOT_STAGE/deps"
cp "$REPO_ROOT/.rebuild/dependency-manifest.json" "$SNAPSHOT_STAGE/dependency-manifest.json"
make_component source-deps "$SNAPSHOT_STAGE"

PY_STAGE="$(new_stage python)"
PY_BIN="$(readlink -f "$(python_path)")"
PY_HOME="$(cd "$(dirname "$PY_BIN")/.." && pwd)"
cp -a "$PY_HOME" "$PY_STAGE/python"
make_component python "$PY_STAGE"

ACTION_STAGE="$(new_stage actionlint)"
mkdir -p "$ACTION_STAGE/bin"
cp "$(actionlint_path)" "$ACTION_STAGE/bin/actionlint"
chmod +x "$ACTION_STAGE/bin/actionlint"
make_component actionlint "$ACTION_STAGE"

BOOT="$OUT/333-toolchain-bootstrap-latest"
mkdir -p "$BOOT/tools"
cp -a "$TOOLCHAIN_DIR" "$BOOT/tools/dev"
cat > "$BOOT/组件清单.txt" <<EOF
333 工具链 build：$(printf '%s ' $BUILD_COMPONENTS)
333 工具链 full 额外：$(printf '%s ' $FULL_EXTRA_COMPONENTS)
npm-public 共 $NPM_PUBLIC_PARTS 片。
需在 333 仓库根目录执行 tools/dev/ai-toolchain.sh plan，
根据输出下载 GitHub Actions 对应 Artifact，全部解压到同一 artifacts 目录。
EOF
(cd "$BOOT"; find tools -type f -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS; sha256sum -c SHA256SUMS)
say "所有组件及 bootstrap 已生成：$OUT"
