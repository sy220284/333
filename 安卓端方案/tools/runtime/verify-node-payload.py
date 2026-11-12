#!/usr/bin/env python3
"""Create and verify a reproducible manifest for an Android Node runtime payload."""
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("runtime_root", type=Path)
parser.add_argument("--abi", default="arm64-v8a", choices=("arm64-v8a", "x86_64"))
parser.add_argument("--check-only", action="store_true")
args = parser.parse_args()
root = args.runtime_root.resolve(strict=True)
version_path = root / "assets/runtime/node/node-version.txt"
version = version_path.read_text(encoding="utf-8").strip()
if not re.fullmatch(r"26\.[0-9]+\.[0-9]+", version):
    raise SystemExit(f"Invalid Node runtime version: {version!r}")
binary = root / "jniLibs" / args.abi / "libdsh_node.so"
if not binary.is_file() or binary.stat().st_size < 1_000_000:
    raise SystemExit(f"Missing Android Node binary: {binary}")
expected_machine = {"arm64-v8a": 183, "x86_64": 62}[args.abi]
with binary.open("rb") as fh:
    header = fh.read(64)
if header[:4] != b"\x7fELF" or header[4] != 2 or header[5] != 1 or struct.unpack_from("<H", header, 18)[0] != expected_machine:
    raise SystemExit(f"Wrong ELF architecture: {binary}")
library_root = root / "assets/runtime/node" / args.abi / "lib"
libraries = sorted(p for p in library_root.iterdir() if p.is_file())
if not libraries:
    raise SystemExit("Runtime shared libraries absent")
package_versions = root / "assets/runtime/node" / args.abi / "packages.tsv"
if not package_versions.is_file():
    raise SystemExit("Signed package provenance absent")
paths = [binary, version_path, package_versions, *libraries]
entries = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
manifest = {"format": "333-node-v1", "abi": args.abi, "nodeVersion": version, "files": entries}
manifest_path = root / "assets/runtime/node/integrity-manifest.json"
if args.check_only:
    original = json.loads(manifest_path.read_text(encoding="utf-8"))
    if original != manifest:
        raise SystemExit("Node runtime manifest or file integrity mismatch")
    print("Node runtime manifest verified:", version, args.abi, len(entries), "files")
else:
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("Node runtime manifest created:", version, args.abi, len(entries), "files")
