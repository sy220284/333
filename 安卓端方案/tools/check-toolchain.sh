#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$ROOT/toolchain-versions.env"
if [[ "${1:-}" == --self-test ]]; then
  grep -Fq "agp = \"$AGP_VERSION\"" "$ROOT/../android-app/gradle/libs.versions.toml"
  grep -Fq "kotlin = \"$KOTLIN_VERSION\"" "$ROOT/../android-app/gradle/libs.versions.toml"
  grep -Fq "compileSdk = $ANDROID_COMPILE_API" "$ROOT/../android-app/app/build.gradle.kts"
  echo "333 Android 工具链版本与 777 基线一致"
  exit 0
fi
for cmd in java javac gradle; do command -v "$cmd" >/dev/null || { echo "缺少 $cmd" >&2; exit 1; }; done
JAVA_MAJOR="$(javac -version 2>&1 | awk '{print $2}' | cut -d. -f1)"
[[ "$JAVA_MAJOR" =~ ^[0-9]+$ ]] && (( JAVA_MAJOR >= BUILD_JDK_MIN_MAJOR )) || { echo "JDK 需要 >= $BUILD_JDK_MIN_MAJOR" >&2; exit 1; }
gradle --version | grep -Fq "Gradle $GRADLE_VERSION" || { echo "Gradle 应为 $GRADLE_VERSION" >&2; exit 1; }
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
[[ -n "$SDK" && ( -d "$SDK/platforms/android-$ANDROID_COMPILE_API" || -d "$SDK/platforms/android-${ANDROID_COMPILE_API}.0" ) ]] || { echo "缺少 Android API $ANDROID_COMPILE_API" >&2; exit 1; }
[[ -d "$SDK/build-tools/$ANDROID_BUILD_TOOLS" ]] || { echo "缺少 Android build-tools $ANDROID_BUILD_TOOLS" >&2; exit 1; }
echo "333 Android 工具链检查通过"
