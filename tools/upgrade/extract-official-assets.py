#!/usr/bin/env python3
"""Extract *exact* 2.1.310 embedded text resources from the official Linux x64 binary.

This uses the system libzstd and matches decompressed SHA256, rather than
guessing compressed offsets, searching user-provided strings, or committing
unverified decompiler reconstructions. No network, pip packages, or shell
interpolation; output is only created after every requested resource matches.
"""
from __future__ import annotations
import argparse
import ctypes
import ctypes.util
import hashlib
import mmap
from pathlib import Path

SOURCE_SHA256 = "b73676430af12f97316a798b8371f81d640f90a58bdcb8f3ce56a835bb47df56"
RESOURCES = {
    "1555c291f4eaf9a496176f3d07c0e86449a6650f91179fa5d3ac1712b63837ac":
        "src/skills/bundled/verify/SKILL.md",
    "377ce3cba7577de2666e79f315e91c2f726e390970ace1ea37925abb8242377a":
        "src/utils/permissions/yolo-classifier-prompts/permissions_external.txt",
    # Additional original 2.1.310 resources: extracted by SHA-256 from zstd
    # frames in the official x64 executable. Keep entitlement-gated skills
    # staged as resources; registration remains controlled by runtime flags.
    "8e4917f5394af51deb3552fdb962051074b9b5df2de2a77a8773009a9d86a62f":
        "src/skills/bundled/artifact-design/SKILL.md",
    "3c60dfa728ba73b9fd800b4ccca63c59e6324f02b779ec38b61993d5a5e30502":
        "src/skills/bundled/prototype/SKILL.md",
    "c6e0680ba50cd02193edaa373bac768346a465302dbbcdd68938bc2972d26c33":
        "src/skills/bundled/design-sync/SKILL.md",
    "0809696a81a4c063a02f12df590a79a41d9595618e9825309c5a6cebb1320486":
        "src/skills/bundled/run-skill-generator/SKILL.md",
    "b9cb992e1762d757c089e87c463871d7b3754c3da01279e9f5cfc5d0ebb60fa8":
        "src/skills/bundled/workshop/SKILL.md",
    "23416ed0054f0d323fb6adfd67b3ffd990128888755e359762af797cb98ace63":
        "src/skills/bundled/cowork-plugin-authoring/SKILL.md",
    "751bdb5c89654884fb22de190031f0902c6d89f84e7b522b9d6d53524961056d":
        "src/skills/bundled/claude-test-spec/SKILL.md",
    "79cf35f01c12c9a8c64c3897079c18bcc63f7c5d346692d39b0ed779cb3b7fab":
        "src/skills/bundled/claude-test-runner/SKILL.md",
    "e205c5bb84639a8312953d44da4489964f3d2ee45c32b236b8ea2e17b1c08ae7":
        "src/skills/bundled/claude-test-conversation/SKILL.md",
    "25714b54d589b5d8bc5a1ad2460f361f4f5f14d21eeeeace6a98f19e0d2267e7":
        "src/skills/bundled/design-sync-storybook/SKILL.md",
    "78fa6e4ce2153422b8598b6702f9363dc6f8c789569463f94b6a36fd5d24eb53":
        "src/skills/bundled/design-sync-package/SKILL.md",
    "05f4c4017a8cbc12329ff8fbbfd49023015d7e937a9cc5912f5270af1e7138ed":
        "src/skills/bundled/plugin-authoring/SKILL.md",
}
MAGIC = b"\x28\xb5\x2f\xfd"
MAX_RESOURCE_BYTES = 2_000_000
ZSTD_UNKNOWN = 0xFFFFFFFFFFFFFFFF
ZSTD_ERROR = 0xFFFFFFFFFFFFFFFE


def library():
    name = ctypes.util.find_library("zstd")
    if not name:
        raise RuntimeError("libzstd is required for exact official resource extraction")
    zstd = ctypes.CDLL(name)
    zstd.ZSTD_getFrameContentSize.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
    zstd.ZSTD_getFrameContentSize.restype = ctypes.c_ulonglong
    zstd.ZSTD_findFrameCompressedSize.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
    zstd.ZSTD_findFrameCompressedSize.restype = ctypes.c_size_t
    zstd.ZSTD_decompress.argtypes = [
        ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_size_t
    ]
    zstd.ZSTD_decompress.restype = ctypes.c_size_t
    zstd.ZSTD_isError.argtypes = [ctypes.c_size_t]
    zstd.ZSTD_isError.restype = ctypes.c_uint
    return zstd


def extract(binary: Path) -> dict[str, bytes]:
    with binary.open("rb") as source:
        actual_sha = hashlib.file_digest(source, "sha256").hexdigest()
        if actual_sha != SOURCE_SHA256:
            raise RuntimeError(f"Wrong official binary sha256: {actual_sha}")
        source.seek(0)
        zstd = library()
        results: dict[str, bytes] = {}
        with mmap.mmap(source.fileno(), 0, access=mmap.ACCESS_READ) as view:
            pos = 0
            while len(results) < len(RESOURCES):
                pos = view.find(MAGIC, pos + 1)
                if pos < 0:
                    break
                probe = ctypes.create_string_buffer(view[pos:pos + 64])
                raw_size = zstd.ZSTD_getFrameContentSize(probe, len(probe))
                if raw_size in (ZSTD_UNKNOWN, ZSTD_ERROR) or not (0 < raw_size <= MAX_RESOURCE_BYTES):
                    continue
                # The official bundle contains independent zstd frames. Feed
                # a bounded window to findFrameCompressedSize, then decode
                # exactly that frame rather than including subsequent frames.
                bound = min(len(view) - pos, max(100_000, raw_size * 3 + 100_000))
                candidate = ctypes.create_string_buffer(view[pos:pos + bound])
                encoded_size = zstd.ZSTD_findFrameCompressedSize(candidate, bound)
                if zstd.ZSTD_isError(encoded_size) or encoded_size > bound:
                    continue
                compressed = ctypes.create_string_buffer(view[pos:pos + encoded_size])
                decoded = ctypes.create_string_buffer(raw_size)
                result_size = zstd.ZSTD_decompress(decoded, raw_size, compressed, encoded_size)
                if zstd.ZSTD_isError(result_size) or result_size != raw_size:
                    continue
                payload = decoded.raw
                fingerprint = hashlib.sha256(payload).hexdigest()
                if fingerprint in RESOURCES:
                    payload.decode("utf-8", errors="strict")
                    results[fingerprint] = payload
        missing = sorted(set(RESOURCES) - set(results))
        if missing:
            raise RuntimeError("Official release missing expected resources: " + ", ".join(missing))
        return results


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--binary", type=Path, required=True, help="Official 2.1.310 Linux x64 ELF")
    p.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    p.add_argument("--write", action="store_true", help="Write recovered bytes to tracked source files")
    args = p.parse_args()
    found = extract(args.binary)
    for digest, relative in RESOURCES.items():
        dest = args.root / relative
        payload = found[digest]
        if args.write:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(payload)
        elif not dest.is_file() or hashlib.sha256(dest.read_bytes()).hexdigest() != digest:
            raise RuntimeError(f"Resource not upgraded to 2.1.310: {relative}")
        print(f"2.1.310 SHA256 verified: {relative} ({len(payload)} bytes, {digest})")


if __name__ == "__main__":
    main()
