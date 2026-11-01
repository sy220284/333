#!/usr/bin/env bash
# 333 的 777 式离线组件安装器：本地只读取 GitHub Actions Artifact，不访问软件源。
set -euo pipefail
TOOLCHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$TOOLCHAIN_DIR/lib.sh"
load_manifest
COMMAND="${1:-help}"
if [ "$#" -gt 0 ]; then shift; fi
PROFILE=build
ARTIFACTS_DIR="${DEV333_ARTIFACTS_DIR:-}"
CONFIGURE_SHELL=false
usage() {
  cat <<'EOF'
333 开发工具链（来自 777 的按需、锁版、离线 Artifact 安装机制）

bash tools/dev/ai-toolchain.sh plan [build|full]
bash tools/dev/ai-toolchain.sh check [build|full]
bash tools/dev/ai-toolchain.sh install [build|full] --artifacts-dir PATH [--configure-shell]

build: Node.js 24、Bun 1.4.4、固定 npm 依赖缓存、从 cli.js.map 恢复的依赖快照
full : 额外包含 Python 3.12 与 actionlint 1.7.12
Linux/WSL x64；macOS/Windows 继续使用 rebuild.yml 的三平台构建。
组件必须来自当前 333 仓库 dev-toolchain.yml 生成的 GitHub Actions Artifacts。
EOF
}
case "$COMMAND" in
  plan|check|install)
    if [ "$#" -gt 0 ] && { [ "$1" = build ] || [ "$1" = full ]; }; then PROFILE="$1"; shift; fi ;;
  help|-h|--help) usage; exit 0 ;;
  *) die "未知命令：$COMMAND" ;;
esac
while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile) shift; PROFILE="${1:-}" ;;
    --artifacts-dir) shift; ARTIFACTS_DIR="${1:-}" ;;
    --configure-shell) CONFIGURE_SHELL=true ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
  shift
done
assert_profile "$PROFILE"
detect_arch
require_repo
case "$COMMAND" in
  plan) missing_artifacts "$PROFILE"; exit 0 ;;
  check) exec bash "$TOOLCHAIN_DIR/setup-toolchain.sh" --check --profile "$PROFILE" ;;
esac
[ -d "$ARTIFACTS_DIR" ] || die "install 必须指定已解压的 --artifacts-dir"
for tool in sha256sum awk cat tar gzip mkdir mktemp cp mv rm sed grep head; do
  command -v "$tool" >/dev/null 2>&1 || die "宿主缺少基础命令：$tool"
done
for root in "$TOOLS_ROOT" "$REPO_ROOT" "$ENV_FILE"; do
  [ -n "$root" ] && [ "$root" != / ] && [ "$root" != "$HOME" ] || die "拒绝危险目标目录：$root"
done
# 复制后的运行时优先于宿主工具；后续组件验证使用同一版本。
export PATH="$TOOLS_ROOT/node/bin:$TOOLS_ROOT/bun/bin:$TOOLS_ROOT/python/bin:$TOOLS_ROOT/bin:$PATH"

artifact_dir() {
  local name="$1"
  if [ -f "$ARTIFACTS_DIR/$name/component.env" ]; then echo "$ARTIFACTS_DIR/$name"
  elif [ -f "$ARTIFACTS_DIR/component.env" ]; then echo "$ARTIFACTS_DIR"
  else return 1; fi
}
get_meta() { sed -n "s/^$2=//p" "$1/component.env" | head -n1; }
verify_part() {
  local folder="$1" comp="$2" part="$3" total="$4" key expected actual payload
  [ -f "$folder/SHA256SUMS" ] && [ -f "$folder/component.env" ] || die "组件缺少校验文件：$folder"
  if [ "$total" -eq 1 ]; then payload=payload.tar.gz; else payload=payload.part; fi
  [ -f "$folder/$payload" ] || die "组件分片不完整：$folder/$payload"
  (cd "$folder" && sha256sum -c SHA256SUMS) || die "组件 SHA-256 校验失败：$folder"
  for spec in \
    "ARTIFACT_SCHEMA:$ARTIFACT_SCHEMA" "ARTIFACT_COMPONENT:$comp" \
    "ARTIFACT_ARCH:$ARCH_KIND" "ARTIFACT_PART:$part" "ARTIFACT_PARTS:$total" \
    "NODE_MAJOR:$NODE_MAJOR" "BUN_VERSION:$BUN_VERSION" \
    "PYTHON_MAJOR:$PYTHON_MAJOR" "PYTHON_MINOR:$PYTHON_MINOR" \
    "ACTIONLINT_VERSION:$ACTIONLINT_VERSION" "SOURCE_MAP_SHA256:$SOURCE_MAP_SHA256" \
    "PUBLIC_LOCK_SHA256:$(repo_lock_hash)"; do
    key="${spec%%:*}"
    expected="${spec#*:}"
    actual="$(get_meta "$folder" "$key")"
    [ "$actual" = "$expected" ] || die "组件版本/身份不符：$comp $key (期望 $expected，实际 $actual)"
  done
}
unpack_component() {
  local comp="$1" temp="$2" count part name folder payload archive
  count="$(component_parts "$comp")"
  archive="$temp/component.tar.gz"
  : > "$archive"
  for ((part=1; part<=count; part++)); do
    if [ "$count" -eq 1 ]; then
      name="333-toolchain-$comp-latest"
      payload=payload.tar.gz
    else
      printf -v name '333-toolchain-%s-part-%02d-latest' "$comp" "$part"
      payload=payload.part
    fi
    folder="$(artifact_dir "$name")" || die "缺少 Artifact：$name"
    verify_part "$folder" "$comp" "$part" "$count"
    cat "$folder/$payload" >> "$archive"
  done
  gzip -t "$archive" || die "组件压缩数据损坏：$comp"
  if tar -tzf "$archive" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
    die "组件包含非法路径：$comp"
  fi
  tar --no-same-owner -xzf "$archive" -C "$temp"
}
replace_dir() {
  local src="$1" dest="$2"
  [ -d "$src" ] || die "Artifact 不含目录：$src"
  mkdir -p "$(dirname "$dest")"
  rm -rf "$dest"
  mv "$src" "$dest"
}
install_component() (
  set -euo pipefail
  local comp="$1" temp
  temp="$(mktemp -d)"
  trap 'rm -rf "$temp"' EXIT
  unpack_component "$comp" "$temp"
  case "$comp" in
    node) replace_dir "$temp/node" "$TOOLS_ROOT/node" ;;
    bun) replace_dir "$temp/bun" "$TOOLS_ROOT/bun" ;;
    python) replace_dir "$temp/python" "$TOOLS_ROOT/python" ;;
    actionlint)
      [ -x "$temp/bin/actionlint" ] || die "actionlint 缺少可执行文件"
      mkdir -p "$TOOLS_ROOT/bin"
      cp "$temp/bin/actionlint" "$TOOLS_ROOT/bin/actionlint"
      chmod +x "$TOOLS_ROOT/bin/actionlint" ;;
    npm-public)
      replace_dir "$temp/public" "$REPO_ROOT/.rebuild/public" ;;
    source-deps)
      replace_dir "$temp/deps" "$REPO_ROOT/.rebuild/deps"
      [ -s "$temp/dependency-manifest.json" ] || die "源码依赖快照缺失清单"
      cp "$temp/dependency-manifest.json" "$REPO_ROOT/.rebuild/dependency-manifest.json" ;;
    *) die "无法安装的组件：$comp" ;;
  esac
  component_ready "$comp" || die "安装后真实组件检测失败：$comp"
  say "[OK] 已安装 $comp"
)

missing="$(missing_components "$PROFILE")"
if [ -z "$missing" ]; then
  say "所有组件已满足，直接复用"
else
  while IFS= read -r component; do
    [ -n "$component" ] || continue
    install_component "$component"
  done <<< "$missing"
fi

# 333 的构建脚本要求根目录 node_modules 指向冻结 npm 安装目录。
if [ ! -e "$REPO_ROOT/node_modules" ] && [ ! -L "$REPO_ROOT/node_modules" ]; then
  ln -s "$REPO_ROOT/.rebuild/public/node_modules" "$REPO_ROOT/node_modules"
elif [ "$(readlink -f "$REPO_ROOT/node_modules")" != "$(readlink -f "$REPO_ROOT/.rebuild/public/node_modules")" ]; then
  die "根目录 node_modules 指向其他依赖；请先检查，避免覆盖用户目录"
fi

mkdir -p "$(dirname "$ENV_FILE")"
{
  printf '# 333 离线工具链；由 tools/dev/install.sh 写入\n'
  printf 'export DEV333_TOOLS_ROOT=%q\n' "$TOOLS_ROOT"
  printf 'export DEV333_REPO_ROOT=%q\n' "$REPO_ROOT"
  printf 'export PATH=%q:%q:%q:%q:"$PATH"\n' \
    "$TOOLS_ROOT/node/bin" "$TOOLS_ROOT/bun/bin" "$TOOLS_ROOT/python/bin" "$TOOLS_ROOT/bin"
} > "$ENV_FILE"
if [ "$CONFIGURE_SHELL" = true ]; then
  case "${SHELL##*/}" in
    zsh) rc="$HOME/.zshrc" ;;
    bash) rc="$HOME/.bashrc" ;;
    *) rc="$HOME/.profile" ;;
  esac
  touch "$rc"
  if ! grep -Fq '# >>> 333 dev toolchain >>>' "$rc"; then
    {
      echo '# >>> 333 dev toolchain >>>'
      printf '[ -f %q ] && . %q\n' "$ENV_FILE" "$ENV_FILE"
      echo '# <<< 333 dev toolchain <<<'
    } >> "$rc"
  fi
fi
bash "$TOOLCHAIN_DIR/setup-toolchain.sh" --check --profile "$PROFILE"
say "安装完成，执行：source $ENV_FILE；随后 npm run verify"
