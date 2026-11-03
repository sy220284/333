#!/usr/bin/env python3
"""Compare embedded skills in a SHA-verified *target* Claude Code x64 binary.

The release notes are not input: inventory is recovered from the actual binary.
This reports asset bytes and repository coverage only; runtime registration and
UI behavior still require executable end-to-end parity evidence.
"""
from __future__ import annotations

import argparse
import ctypes
import ctypes.util
import hashlib
import json
import mmap
import re
from pathlib import Path

MAGIC = b"\x28\xb5\x2f\xfd"
MAX_RESOURCE_BYTES = 3_000_000
ZSTD_UNKNOWN = 0xFFFFFFFFFFFFFFFF
ZSTD_ERROR = 0xFFFFFFFFFFFFFFFE
FRONTMATTER_NAME = re.compile(r"^name:\s*([a-z][a-z0-9-]{1,75})\s*$", re.MULTILINE)
SHA256 = re.compile(r"^[a-f0-9]{64}$")


def zstd_library():
    name = ctypes.util.find_library("zstd")
    if not name:
        raise RuntimeError("libzstd is needed to inspect the official native asset frames")
    lib = ctypes.CDLL(name)
    lib.ZSTD_getFrameContentSize.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
    lib.ZSTD_getFrameContentSize.restype = ctypes.c_ulonglong
    lib.ZSTD_findFrameCompressedSize.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
    lib.ZSTD_findFrameCompressedSize.restype = ctypes.c_size_t
    lib.ZSTD_decompress.argtypes = [
        ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_size_t
    ]
    lib.ZSTD_decompress.restype = ctypes.c_size_t
    lib.ZSTD_isError.argtypes = [ctypes.c_size_t]
    lib.ZSTD_isError.restype = ctypes.c_uint
    return lib


def classify_skill(payload: bytes) -> str | None:
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError:
        return None
    if text.startswith("---\n"):
        end = text.find("\n---", 4, 4096)
        if end > 0:
            metadata = text[4:end]
            match = FRONTMATTER_NAME.search(metadata)
            if match and "description:" in metadata:
                return match.group(1)
    if text.startswith("# Cowork Plugin Authoring\n"):
        return "cowork-plugin-authoring"
    return None


def embedded_skills(binary: Path):
    lib = zstd_library()
    discovered: dict[str, dict] = {}
    frames = 0
    with binary.open("rb") as handle, mmap.mmap(handle.fileno(), 0, access=mmap.ACCESS_READ) as view:
        position = 0
        while True:
            position = view.find(MAGIC, position + 1)
            if position < 0:
                break
            probe = ctypes.create_string_buffer(view[position:position + 64])
            size = lib.ZSTD_getFrameContentSize(probe, len(probe))
            if size in (ZSTD_UNKNOWN, ZSTD_ERROR) or not (0 < size <= MAX_RESOURCE_BYTES):
                continue
            bound = min(len(view) - position, max(100_000, size * 3 + 100_000))
            candidate = ctypes.create_string_buffer(view[position:position + bound])
            encoded = lib.ZSTD_findFrameCompressedSize(candidate, bound)
            if lib.ZSTD_isError(encoded) or encoded == 0 or encoded > bound:
                continue
            compressed = ctypes.create_string_buffer(view[position:position + encoded])
            decoded = ctypes.create_string_buffer(size)
            actual = lib.ZSTD_decompress(decoded, size, compressed, encoded)
            if lib.ZSTD_isError(actual) or actual != size:
                continue
            frames += 1
            payload = decoded.raw
            name = classify_skill(payload)
            if name is None:
                continue
            digest = hashlib.sha256(payload).hexdigest()
            previous = discovered.get(name)
            if previous and previous["sha256"] != digest:
                raise RuntimeError(f"Ambiguous embedded skill versions for {name}")
            discovered[name] = {
                "name": name, "sha256": digest, "bytes": len(payload),
                "frame_offset": position,
            }
    if frames == 0:
        raise RuntimeError("No independently decoded embedded zstd frames: binary format needs review")
    return discovered, frames


def audit(binary: Path, root: Path, expected_sha256: str, version: str):
    with binary.open("rb") as handle:
        binary_hash = hashlib.file_digest(handle, "sha256").hexdigest()
    if binary_hash != expected_sha256:
        raise RuntimeError(f"Wrong {version} native binary: expected {expected_sha256}, got {binary_hash}")
    found, frame_count = embedded_skills(binary)
    source_root = root / "src/skills/bundled"
    if not source_root.is_dir():
        raise RuntimeError(f"Bundled skill directory is missing: {source_root}")
    rows = []
    for name, asset in sorted(found.items()):
        source = source_root / name / "SKILL.md"
        actual = hashlib.sha256(source.read_bytes()).hexdigest() if source.is_file() else None
        rows.append({
            **asset, "source_path": str(source.relative_to(root)),
            "candidate_sha256": actual,
            "status": "MATCH" if actual == asset["sha256"] else
                      "DIFFERS" if actual else "MISSING",
        })
    known_names = set(found)
    for source in sorted(source_root.glob("*/SKILL.md")):
        if source.parent.name not in known_names:
            rows.append({
                "name": source.parent.name,
                "source_path": str(source.relative_to(root)),
                "candidate_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "status": "NOT_LOCATED_IN_BINARY",
            })
    return {
        "target_version": version, "official_x64_sha256": binary_hash,
        "decoded_frames": frame_count, "located_skills": len(found),
        "comparison_scope": "embedded skill bytes; not registration, tools, or UI",
        "counts": {status: sum(x["status"] == status for x in rows)
                   for status in ("MATCH", "DIFFERS", "MISSING", "NOT_LOCATED_IN_BINARY")},
        "skills": rows,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    expected = args.expected_sha256.lower()
    if not SHA256.fullmatch(expected):
        raise ValueError("Official manifest SHA-256 must be a 64-character hexadecimal string")
    report = audit(args.binary, args.root, expected, args.target)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"version": args.target, "found": report["located_skills"], "counts": report["counts"]}))
    if args.strict and any(s["status"] != "MATCH" for s in report["skills"]):
        raise SystemExit("Official target skill resources require migration and executable verification")


if __name__ == "__main__":
    main()
