#!/usr/bin/env python3
"""Convert verified signed Termux Node libraries into one SHA-addressed APK payload per binary.

This consumes the output of prepare-termux-node.sh. The original signed index, ELF
alignment, and DT_NEEDED checks have already run. This final stage verifies each
source again, collapses identical library bytes, then emits an exact v2 manifest.
"""
import argparse
import hashlib
import json
import re
import shutil
import struct
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("runtime_root", type=Path)
parser.add_argument("--abi", default="arm64-v8a", choices=("arm64-v8a", "x86_64"))
parser.add_argument("--check-only", action="store_true")
args = parser.parse_args()
root = args.runtime_root.resolve(strict=True)
abi = args.abi
asset_root = root / "assets/runtime/node"
version_path = asset_root / "node-version.txt"
version = version_path.read_text(encoding="utf-8").strip()
if not re.fullmatch(r"26\.[0-9]+\.[0-9]+", version):
    raise SystemExit(f"Invalid fixed Node major: {version}")
node = root / "jniLibs" / abi / "libdsh_node.so"
if not node.is_file() or node.stat().st_size < 1_000_000:
    raise SystemExit(f"Missing Android Node binary: {node}")
with node.open("rb") as stream:
    header = stream.read(64)
if (header[:4] != b"\x7fELF" or header[4:6] != b"\x02\x01"
    or struct.unpack_from("<H", header, 18)[0] != {"arm64-v8a": 183, "x86_64": 62}[abi]):
    raise SystemExit("Wrong ELF machine or format")
provenance = asset_root / abi / "packages.tsv"
if not provenance.is_file() or not provenance.read_text(encoding="utf-8").strip():
    raise SystemExit("Signed Termux package provenance absent")

def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(block)
    return sha.hexdigest()

def rel(path: Path) -> str:
    return path.relative_to(root).as_posix()

manifest_path = asset_root / "integrity-manifest.json"
files = {rel(p): digest(p) for p in [node, version_path, provenance]}
source_libs = asset_root / abi / "lib"
blob_dir = asset_root / abi / "blobs"
name_re = re.compile(r"[A-Za-z0-9._+\-]+\Z")
sha_re = re.compile(r"[0-9a-f]{64}\Z")

if args.check_only:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (manifest.get("format") != "333-node-v2" or manifest.get("abi") != abi
        or manifest.get("nodeVersion") != version or manifest.get("files") != files):
        raise SystemExit("Runtime metadata mismatch")
    libraries = manifest.get("libraries")
    blobs = manifest.get("blobs")
    if not isinstance(libraries, dict) or not isinstance(blobs, dict) or not libraries:
        raise SystemExit("Invalid compact library manifest")
    if any(not name_re.fullmatch(k) or not sha_re.fullmatch(v) for k,v in libraries.items()):
        raise SystemExit("Unsafe library aliases or digest")
    if set(libraries.values()) != set(blobs):
        raise SystemExit("Missing or extra content-addressed blob")
    for sha, nbytes in blobs.items():
        p = blob_dir / sha
        if not isinstance(nbytes, int) or nbytes <= 0 or not p.is_file() or p.stat().st_size != nbytes or digest(p) != sha:
            raise SystemExit(f"Corrupted runtime blob: {sha}")
    if source_libs.exists() or set(x.name for x in blob_dir.iterdir()) != set(blobs):
        raise SystemExit("Runtime payload was not fully compacted")
    print(f"PASS Node {version}, {abi}, {len(libraries)} names, {len(blobs)} verified unique blobs")
else:
    if not source_libs.is_dir():
        raise SystemExit("Original signed shared libraries not found")
    libraries = {}
    blobs = {}
    source_paths = sorted(x for x in source_libs.iterdir() if x.is_file())
    if not source_paths:
        raise SystemExit("No shared libraries in source payload")
    blob_dir.mkdir(parents=True, exist_ok=True)
    for p in source_paths:
        if not name_re.fullmatch(p.name):
            raise SystemExit(f"Unsafe library name: {p.name}")
        sha = digest(p)
        canonical = blob_dir / sha
        if not canonical.exists():
            shutil.copyfile(p, canonical)
        if digest(canonical) != sha:
            raise SystemExit(f"Blob SHA-256 mismatch for {p.name}")
        libraries[p.name] = sha
        blobs[sha] = canonical.stat().st_size
    if len(blobs) > len(libraries):
        raise SystemExit("Invalid library mapping")
    manifest = {
        "format": "333-node-v2", "abi": abi, "nodeVersion": version,
        "files": files, "libraries": libraries, "blobs": blobs,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    shutil.rmtree(source_libs)
    print(f"Compact Node runtime: {len(libraries)} library names -> {len(blobs)} unique blobs; "
          f"saved {sum(p.stat().st_size for p in blob_dir.iterdir())} bytes unique")
