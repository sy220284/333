#!/usr/bin/env python3
"""校验安卓设计合约和 Gradle/777 工具链文件的最基本结构，不冒充 Kotlin 编译。"""
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
for name in ("contracts/feature-map.json", "design/tokens.json", "design/motion.json", "design/components.json"):
    p = ROOT / name
    data = json.loads(p.read_text(encoding="utf-8"))
    assert data["schema"].startswith("333-"), name
    print(f"PASS {name}")
features = json.loads((ROOT / "contracts/feature-map.json").read_text(encoding="utf-8"))["features"]
assert len(features) >= 20
assert len({f["action"] for f in features}) == len(features)
assert all(f["endpoint"] and len(f["states"]) == 6 for f in features)
for p in (ROOT / "assets/icons").glob("*.svg"):
    root = ET.parse(p).getroot()
    assert root.attrib["viewBox"] == "0 0 24 24", p
icons = list((ROOT / "assets/icons").glob("*.svg"))
assert len(icons) >= 20
manifest = ET.parse(ROOT / "android-app/app/src/main/AndroidManifest.xml").getroot()
assert manifest.tag == "manifest"
assert (ROOT / "android-app/app/src/main/res/xml/network_security_config.xml").exists()
env = (ROOT / "tools/toolchain-versions.env").read_text(encoding="utf-8")
toml = (ROOT / "android-app/gradle/libs.versions.toml").read_text(encoding="utf-8")
for envkey, tomlkey in (("AGP_VERSION", "agp"), ("KOTLIN_VERSION", "kotlin")):
    match = re.search(rf"^{envkey}=(.+)$", env, re.M)
    assert match and f'{tomlkey} = "{match.group(1).strip()}"' in toml
expected = [
"app/src/main/java/ai/deepseek/harness/mobile/MainActivity.kt",
"app/src/main/java/ai/deepseek/harness/mobile/net/HarnessRemote.kt",
"app/src/main/java/ai/deepseek/harness/mobile/ui/HarnessApp.kt",
"app/src/main/java/ai/deepseek/harness/mobile/runtime/LocalRuntime.kt",
]
for relative in expected:
    assert (ROOT / "android-app" / relative).is_file(), relative
# V1.1 设计路由与真实原生实现状态分开验证，拒绝用页面映射冒充完整功能。
catalog = json.loads((ROOT / "android-app/app/src/main/assets/design/feature-navigation-v1.1.json").read_text(encoding="utf-8"))
implementation = json.loads((ROOT / "contracts/feature-native-status-v1.1.json").read_text(encoding="utf-8"))
assert catalog["schema"] == "333-feature-navigation-v1.1"
assert implementation["schema"] == "333-android-v1.1-native-implementation"
routes = catalog["features"]
statuses = implementation["features"]
assert len(routes) == len(statuses) == 72
assert len({row["id"] for row in routes}) == 72
assert {row["id"] for row in routes} == {row["id"] for row in statuses}
assert catalog["roots"] == ["home", "sessions", "projects", "task-center", "capabilities", "settings"]
assert {role: sum(row["role"] == role for row in routes) for role in (
    "root", "section", "detail", "contextual", "background")} == {
    "root": 6, "section": 27, "detail": 18, "contextual": 15, "background": 6}
by_id = {row["id"]: row for row in routes}
for row in routes:
    if row["role"] in ("root", "section", "detail"):
        assert row["depth"] in (1, 2, 3), row["id"]
    else:
        assert row["depth"] is None, row["id"]
    if row["parent"] is not None:
        assert row["parent"] in by_id, row["id"]
for status in statuses:
    assert status["role"] == by_id[status["id"]]["role"], status["id"]
    assert status["nativeState"] in (
        "native-wired", "native-partial", "not-connected", "core-background")
    assert status["runtimeVerified"] is False, status["id"]
    if status["role"] == "background":
        assert status["nativeState"] == "core-background", status["id"]
    if status["nativeState"] in ("native-wired", "native-partial"):
        source = status["nativeSource"]
        assert isinstance(source, str) and (ROOT / source).is_file(), status["id"]
    else:
        assert status["nativeSource"] is None, status["id"]
print("PASS V1.1 feature catalogue=72 and native-status coverage=72")
print(f"PASS feature-map={len(features)} icons={len(icons)} Kotlin sources={len(expected)}")
