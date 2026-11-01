#!/usr/bin/env bash
# 333 工具链组件检查；setup-toolchain.sh / install.sh 共享。
say() { printf '[333-toolchain] %s\n' "$*"; }
die() { printf '[333-toolchain] %s\n' "$*" >&2; exit 2; }
load_manifest() {
  # shellcheck disable=SC1090
  source "$TOOLCHAIN_DIR/toolchain-versions.env"
  # shellcheck disable=SC1090
  source "$TOOLCHAIN_DIR/toolchain-components.env"
  TOOLS_ROOT="${DEV333_TOOLS_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/333-dev}"
  ENV_FILE="${DEV333_TOOLCHAIN_ENV_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/333/dev-toolchain.env}"
  REPO_ROOT="${DEV333_REPO_ROOT:-$PWD}"
}
require_repo() {
  [ -f "$REPO_ROOT/package.json" ] && [ -f "$REPO_ROOT/build/public-dependencies.lock.json" ] || die "找不到 333 仓库根目录；请设置 DEV333_REPO_ROOT"
}
detect_arch() {
  [ "$(uname -s)" = Linux ] || die "离线组件支持 Linux/WSL x64；macOS/Windows 使用 rebuild.yml"
  case "$(uname -m)" in
    x86_64|amd64) ARCH_KIND=x64 ;;
    *) die "当前发布组件仅支持 Linux x64：$(uname -m)" ;;
  esac
}
assert_profile() { case "$1" in build|full|dev) ;; *) die "仅支持 build/full/dev：$1";; esac; }
component_parts() { if [ "$1" = npm-public ]; then echo "$NPM_PUBLIC_PARTS"; else echo 1; fi; }
artifacts_for() {
  local count i
  count="$(component_parts "$1")"
  if [ "$count" -eq 1 ]; then printf '333-toolchain-%s-latest\n' "$1"; return; fi
  for ((i=1; i<=count; i++)); do printf '333-toolchain-%s-part-%02d-latest\n' "$1" "$i"; done
}
components_for() {
  printf '%s\n' $BUILD_COMPONENTS
  if [ "$1" = full ] || [ "$1" = dev ]; then printf '%s\n' $FULL_EXTRA_COMPONENTS; fi
  if [ "$1" = dev ]; then printf '%s\n' $DEV_EXTRA_COMPONENTS; fi
}
node_path() {
  if [ -x "$TOOLS_ROOT/node/bin/node" ]; then echo "$TOOLS_ROOT/node/bin/node"
  else command -v node; fi
}
bun_path() {
  if [ -x "$TOOLS_ROOT/bun/bin/bun" ]; then echo "$TOOLS_ROOT/bun/bin/bun"
  else command -v bun; fi
}
python_path() {
  if [ -x "$TOOLS_ROOT/python/bin/python3" ]; then echo "$TOOLS_ROOT/python/bin/python3"
  else command -v python3; fi
}
actionlint_path() {
  if [ -x "$TOOLS_ROOT/bin/actionlint" ]; then echo "$TOOLS_ROOT/bin/actionlint"
  else command -v actionlint; fi
}
repo_lock_hash() { sha256sum "$REPO_ROOT/build/public-dependencies.lock.json" | awk '{print $1}'; }
source_map_valid() {
  [ -f "$REPO_ROOT/cli.js.map" ] &&
    [ "$(sha256sum "$REPO_ROOT/cli.js.map" | awk '{print $1}')" = "$SOURCE_MAP_SHA256" ]
}
component_ready() {
  local p
  case "$1" in
    node)
      p="$(node_path)" || return 1
      [ "$("$p" -p 'process.versions.node.split(".")[0]' 2>/dev/null)" = "$NODE_MAJOR" ] || return 1
      if [ -x "$(dirname "$p")/npm" ]; then return 0; fi
      command -v npm >/dev/null 2>&1
      ;;
    bun)
      p="$(bun_path)" || return 1
      [ "$("$p" --version 2>/dev/null)" = "$BUN_VERSION" ]
      ;;
    npm-public)
      require_repo
      [ -f "$REPO_ROOT/.rebuild/public/.installed-sha256" ] &&
        [ "$(cat "$REPO_ROOT/.rebuild/public/.installed-sha256")" = "$(repo_lock_hash)" ] &&
        [ -s "$REPO_ROOT/.rebuild/public/node_modules/react/package.json" ]
      ;;
    source-deps)
      require_repo
      [ -s "$REPO_ROOT/.rebuild/dependency-manifest.json" ] &&
        [ -s "$REPO_ROOT/.rebuild/deps/node_modules/react/cjs/react.production.js" ] &&
        source_map_valid &&
        "$(node_path)" -e '
          const fs=require("fs");
          const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
          if(d.sourceMapSha256!==process.argv[2] || d.files!==2850 || d.packages!==316)process.exit(1);
        ' "$REPO_ROOT/.rebuild/dependency-manifest.json" "$SOURCE_MAP_SHA256" >/dev/null 2>&1
      ;;
    python)
      p="$(python_path)" || return 1
      if [ "$p" = "$TOOLS_ROOT/python/bin/python3" ]; then
        LD_LIBRARY_PATH="$TOOLS_ROOT/python/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" "$p" -c "import sys; assert sys.version_info >= ($PYTHON_MAJOR, $PYTHON_MINOR)" 2>/dev/null
      else
        "$p" -c "import sys; assert sys.version_info >= ($PYTHON_MAJOR, $PYTHON_MINOR)" 2>/dev/null
      fi
      ;;
    actionlint)
      p="$(actionlint_path)" || return 1
      "$p" -version 2>/dev/null | grep -Fq "$ACTIONLINT_VERSION"
      ;;
    dev-tools)
      local dev_bin="$TOOLS_ROOT/dev-tools/node_modules/.bin"
      [ -x "$dev_bin/tsc" ] || dev_bin="$TOOLCHAIN_DIR/node_modules/.bin"
      [ -x "$dev_bin/tsc" ] && [ -x "$dev_bin/biome" ] &&
        [ "$("$dev_bin/tsc" --version 2>/dev/null)" = 'Version 5.9.3' ] &&
        "$dev_bin/biome" --version 2>/dev/null | grep -Fq '2.6.3'
      ;;
    *) die "未知组件：$1" ;;
  esac
}
missing_components() {
  local component
  while IFS= read -r component; do
    [ -n "$component" ] || continue
    component_ready "$component" || echo "$component"
  done < <(components_for "$1")
}
missing_artifacts() {
  local component
  while IFS= read -r component; do
    [ -n "$component" ] || continue
    artifacts_for "$component"
  done < <(missing_components "$1")
}
self_test() {
  require_repo
  source_map_valid || die "cli.js.map 的 SHA-256 与原始冻结基线不一致"
  local n b s
  n="$(grep -oE 'node-version: [0-9]+' "$REPO_ROOT/.github/workflows/dev-toolchain.yml" | head -n1 | awk '{print $2}')"
  b="$(grep -oE 'bun-version: [0-9.]+' "$REPO_ROOT/.github/workflows/rebuild.yml" | head -n1 | awk '{print $2}')"
  [ "$n" = "$NODE_MAJOR" ] || die "Node 版本与工具链工作流不一致"
  [ "$b" = "$BUN_VERSION" ] || die "Bun 版本与现有重建工作流不一致"
  grep -Fq '"rebuild":' "$REPO_ROOT/package.json" || die "缺少重建命令"
  for s in build/restore-dependencies.mjs build/install-public-deps.mjs build/rebuild.mjs build/package-release.mjs; do
    [ -f "$REPO_ROOT/$s" ] || die "构建入口缺失：$s"
  done
  say "版本清单、源码映射与构建入口自检通过"
}
