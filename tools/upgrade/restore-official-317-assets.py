#!/usr/bin/env python3
"""Restore the 101 unpaired 2.1.317 embedded resources from the exact official ELF.

The compact index maps verified byte offsets to source-relative destinations.
No resources are fetched from third-party packages, reconstructed or mocked.
Only --write modifies source; ordinary mode checks the committed tree.
"""
from __future__ import annotations
import argparse
import base64
import ctypes
import ctypes.util
import hashlib
import json
from pathlib import Path
import zlib

SOURCE_SHA = "eb224419e344575faa4a1f39b290b649425a10cd5ee2ef1d003480cd9ae57eb0"
# [ELF offset, raw bytes, destination, original zstd?, UTF16LE -> UTF8?]
INDEX = (
"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"
)

def module_index():
    items = json.loads(zlib.decompress(base64.b64decode(INDEX)))
    if len(items) != 101:
        raise ValueError("The release must contain 101 audited resources")
    paths = set()
    for entry in items:
        if len(entry) != 5:
            raise ValueError("Invalid resource offset or mapping")
        offset, size, relative, compressed, utf16 = entry
        path = Path(relative)
        if not relative.startswith("src/") or path.is_absolute() or ".." in path.parts or relative in paths:
            raise ValueError("Unsafe or duplicate official resource path")
        if not isinstance(offset, int) or not isinstance(size, int) or offset < 0 or size <= 0:
            raise ValueError("Invalid original resource byte range")
        paths.add(relative)
    return items

def decompressor():
    name = ctypes.util.find_library("zstd")
    if not name:
        raise RuntimeError("Original resource verification requires libzstd")
    lib = ctypes.CDLL(name)
    lib.ZSTD_getFrameContentSize.argtypes = [ctypes.c_void_p, ctypes.c_size_t]
    lib.ZSTD_getFrameContentSize.restype = ctypes.c_ulonglong
    lib.ZSTD_decompress.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_size_t]
    lib.ZSTD_decompress.restype = ctypes.c_size_t
    lib.ZSTD_isError.argtypes = [ctypes.c_size_t]
    lib.ZSTD_isError.restype = ctypes.c_uint
    return lib

def restored(lib, raw, compressed, utf16):
    if compressed:
        length = lib.ZSTD_getFrameContentSize(raw, len(raw))
        if length > 20_000_000:
            raise ValueError("Corrupt or oversized official zstd resource")
        output = ctypes.create_string_buffer(length)
        actual = lib.ZSTD_decompress(output, length, raw, len(raw))
        if lib.ZSTD_isError(actual) or actual != length:
            raise ValueError("Original zstd decompression failure")
        raw = output.raw
    if utf16:
        raw = raw.decode("utf-16le").encode("utf-8")
    return raw

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--binary", type=Path, required=True)
    p.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    p.add_argument("--write", action="store_true")
    args = p.parse_args()
    with args.binary.open("rb") as binary:
        if hashlib.file_digest(binary, "sha256").hexdigest() != SOURCE_SHA:
            raise ValueError("The executable is not the exact official Claude Code 2.1.317 x64")
        binary.seek(0, 2)
        filesize = binary.tell()
        lib = decompressor()
        prepared = []
        for offset, size, name, compressed, utf16 in module_index():
            if offset + size > filesize:
                raise ValueError("Original resource exceeds executable bounds: " + name)
            binary.seek(offset)
            contents = restored(lib, binary.read(size), compressed, utf16)
            destination = args.root / name
            if destination.exists() and destination.read_bytes() != contents:
                raise ValueError("An existing source differs from the original: " + name)
            prepared.append((destination, contents, name))
    missing = []
    for target, contents, name in prepared:
        if args.write:
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                target.write_bytes(contents)
        elif not target.is_file():
            missing.append(name)
    if missing:
        raise ValueError("Unrestored official resources: " + ", ".join(missing))
    print(json.dumps({"target":"2.1.317","result":"PASS","verified":len(prepared),"bytes":sum(len(b) for _,b,_ in prepared)}))

if __name__ == "__main__":
    main()
