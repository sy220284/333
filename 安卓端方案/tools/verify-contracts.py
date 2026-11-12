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
print(f"PASS feature-map={len(features)} icons={len(icons)} Kotlin sources={len(expected)}")
