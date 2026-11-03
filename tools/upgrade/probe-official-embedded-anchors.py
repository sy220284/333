#!/usr/bin/env python3
"""Read-only, hash-pinned index of version 2.1.310 embedded release modules.

The probe never writes extracted proprietary code into the product tree.
It records binary provenance, independent compressed-frame hashes, and small
function-search windows to trace F075/F076/F077 before changing consumers.
"""
from __future__ import annotations

import argparse
import ctypes
import ctypes.util
import hashlib
import json
import mmap
from pathlib import Path

OFFICIAL_SHA256 = "b73676430af12f97316a798b8371f81d640f90a58bdcb8f3ce56a835bb47df56"
MAGIC = b"\x28\xb5\x2f\xfd"
MAX_FRAME_BYTES = 16_000_000
KEYWORDS = {
    # artifactId in Maven's <artifactId> is a Java dependency coordinate.
    # It previously produced two false positives in documentation resources.
    "F075_artifact": ("ReviewArtifactTool", "artifact_comment", "publish_artifact", "artifact_page"),
    "F076_claude_test": ("claude_test", "claude-test"),
    "F077_design_sync": ("design-consent", "design-revoke", "design-login", "/design-sync"),
}
NEEDLES = [(group, word, word.encode("utf-8")) for group, terms in KEYWORDS.items() for word in terms]


def open_zstd():
    name = ctypes.util.find_library("zstd")
    if not name:
        raise RuntimeError("The official-module index requires libzstd")
    zstd = ctypes.CDLL(name)
    zstd.ZSTD_getFrameContentSize.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
    zstd.ZSTD_getFrameContentSize.restype = ctypes.c_ulonglong
    zstd.ZSTD_findFrameCompressedSize.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
    zstd.ZSTD_findFrameCompressedSize.restype = ctypes.c_size_t
    zstd.ZSTD_decompress.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_size_t]
    zstd.ZSTD_decompress.restype = ctypes.c_size_t
    zstd.ZSTD_isError.argtypes = [ctypes.c_size_t]
    zstd.ZSTD_isError.restype = ctypes.c_uint
    return zstd


def search(binary: Path) -> dict:
    with binary.open("rb") as inp:
        digest = hashlib.file_digest(inp, "sha256").hexdigest()
        if digest != OFFICIAL_SHA256:
            raise ValueError(f"Target binary fingerprint mismatch: {digest}")
        inp.seek(0)
        zstd = open_zstd()
        found = []
        frames = 0
        decoded = 0
        with mmap.mmap(inp.fileno(), 0, access=mmap.ACCESS_READ) as buf:
            pos = -1
            while True:
                pos = buf.find(MAGIC, pos + 1)
                if pos < 0:
                    break
                frames += 1
                header = ctypes.create_string_buffer(buf[pos:pos + min(64, len(buf) - pos)])
                raw_len = zstd.ZSTD_getFrameContentSize(header, len(header))
                if not (0 < raw_len <= MAX_FRAME_BYTES):
                    continue
                bound = min(len(buf) - pos, max(100_000, raw_len * 3 + 100_000))
                candidate = ctypes.create_string_buffer(buf[pos:pos + bound])
                zipped_len = zstd.ZSTD_findFrameCompressedSize(candidate, bound)
                if zstd.ZSTD_isError(zipped_len) or zipped_len > bound:
                    continue
                compressed = ctypes.create_string_buffer(buf[pos:pos + zipped_len])
                uncompressed = ctypes.create_string_buffer(raw_len)
                actual = zstd.ZSTD_decompress(uncompressed, raw_len, compressed, zipped_len)
                if zstd.ZSTD_isError(actual) or actual != raw_len:
                    continue
                decoded += 1
                data = uncompressed.raw
                hits = []
                for group, word, token in NEEDLES:
                    at = data.find(token)
                    if at < 0:
                        continue
                    window = data[max(at - 90, 0):min(at + len(token) + 120, len(data))]
                    preview = window.decode("utf-8", "replace").replace("\r", " ").replace("\n", " ")
                    hits.append({
                        "feature": group,
                        "needle": word,
                        "instances": data.count(token),
                        "context": preview,
                    })
                if hits:
                    # Resource frames can contain Markdown/embedded skill docs.
                    # A matched term is navigation evidence, not a call chain.
                    resource_kind = (
                        "skill_documentation"
                        if data.lstrip().startswith(b"---") or b"# Sync a design system to claude.ai/design" in data
                        else "embedded_resource_unclassified"
                    )
                    found.append({
                        "resource_kind": resource_kind,
                        "offset": pos,
                        "sha256": hashlib.sha256(data).hexdigest(),
                        "bytes": len(data),
                        "hits": hits,
                    })
        summaries = {group: sum(any(h["feature"] == group for h in item["hits"]) for item in found) for group in KEYWORDS}
        return {
            "schema": 1,
            "version": "2.1.310",
            "source": "official Linux x64 native executable",
            "source_sha256": digest,
            "scanned_zstd_frames": frames,
            "decoded_frames": decoded,
            "matches": len(found),
            "scope_limit": "zstd-decodable embedded resources only; native executable's other code is not examined",
            "feature_equivalence_verified": False,
            "groups": summaries,
            "records": sorted(found, key=lambda e: (-len(e["hits"]), -e["bytes"], e["offset"]))[:40],
            "unlisted_match_count": max(0, len(found) - 40),
        }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--require-anchors", action="store_true")
    args = parser.parse_args()
    result = search(args.binary)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps({key: value for key, value in result.items() if key != "records"}, ensure_ascii=False))
    if args.require_anchors and all(n == 0 for n in result["groups"].values()):
        raise RuntimeError("The exact official executable yielded no target feature anchors; inspect the packing format before claiming coverage")


if __name__ == "__main__":
    main()
