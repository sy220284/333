#!/usr/bin/env bash
set -euo pipefail
TOOLCHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$TOOLCHAIN_DIR/lib.sh"
load_manifest
PROFILE=build
MODE=check
while [ "$#" -gt 0 ]; do
  case "$1" in
    --profile) shift; PROFILE="${1:-}" ;;
    --check) MODE=check ;;
    --plan) MODE=plan ;;
    --self-test) MODE=self-test ;;
    -h|--help) echo '用法: bash tools/dev/setup-toolchain.sh [--check|--plan|--self-test] [--profile build|full|dev]'; exit 0 ;;
    *) die "未知参数：$1" ;;
  esac
  shift
done
assert_profile "$PROFILE"
if [ "$MODE" = self-test ]; then self_test; exit 0; fi
detect_arch
require_repo
if [ "$MODE" = plan ]; then missing_artifacts "$PROFILE"; exit 0; fi
failed=0
for c in $(components_for "$PROFILE"); do
  if component_ready "$c"; then say "[OK] $c"; else say "[MISSING] $c"; failed=1; fi
done
if [ "$failed" -ne 0 ]; then
  say "缺失的 GitHub Actions 组件 Artifact："
  missing_artifacts "$PROFILE"
  exit 1
fi
say "$PROFILE 环境检查通过"
