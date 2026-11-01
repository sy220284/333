#!/usr/bin/env bash
set -euo pipefail
TOOLCHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$TOOLCHAIN_DIR/install.sh" "$@"
