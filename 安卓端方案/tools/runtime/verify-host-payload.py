#!/usr/bin/env python3
"""验证完整 Host 发布包的可恢复性和 Android 原生依赖边界。"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import struct
import zipfile

MANIFEST = "assets/runtime/dsh-host-manifest.json"
ARCHIVE = "assets/runtime/host/package.zip"
MAX_FILES = 200000
MAX_BYTES = 1500000000

def sha256(handle):
    h = hashlib.sha256()
    for data in iter(lambda: handle.read(1024 * 1024), b""):
        h.update(data)
    return h.hexdigest()

def verify(root: Path, source: Path | None = None, target: str = "android-arm64") -> dict:
    metadata = json.loads((root / MANIFEST).read_text(encoding="utf-8"))
    assert metadata.get("format") == "333-host-v1", "Host 清单格式不正确"
    assert metadata.get("entry") == "lib/bin.js", "必须使用官方 dsh 入口"
    assert re.fullmatch(r"[0-9a-f]{64}", metadata.get("sha256","")), "归档摘要缺失"
    archive = root / ARCHIVE
    assert archive.is_file(), "缺少 Host 归档"
    assert metadata["bytes"] == archive.stat().st_size and metadata["bytes"] > 0, "Host 归档长度与清单不匹配"
    with archive.open("rb") as f:
        assert sha256(f) == metadata["sha256"], "Host 归档摘要校验失败"
    native_files = []
    names = set()
    total = 0
    with zipfile.ZipFile(archive) as pack:
        for info in pack.infolist():
            name = info.filename
            p = PurePosixPath(name)
            assert name and not name.startswith("/") and "\\" not in name and all(part not in ("..", ".") for part in p.parts), f"非法压缩路径：{name}"
            assert name not in names, f"重复的压缩条目：{name}"
            names.add(name)
            bits = (info.external_attr >> 16) & 0o170000
            assert bits == stat.S_IFREG, f"归档包含非普通文件：{name}"
            assert len(names) <= MAX_FILES, "Host 文件数量超过上限"
            total += info.file_size
            assert total <= MAX_BYTES, "Host 解压体积超过上限"
            with pack.open(info) as stream:
                suffix = p.suffix.lower()
                if suffix in {".so",".node",".dylib",".dll"} or ".so." in name:
                    data = stream.read()
                    native_files.append(name)
                    if target == "android-arm64":
                        if not data.startswith(b"\x7fELF") or len(data)<20:
                            raise AssertionError(f"Android 不支持的动态库格式：{name}")
                        machine=struct.unpack_from("<H",data,18)[0]
                        if machine != 183:
                            raise AssertionError(f"Host 动态库并非 Android ARM64：{name} (machine={machine})")
                        if b"GLIBC_" in data or b"libc.so.6" in data or b"/lib/ld-linux" in data:
                            raise AssertionError(f"Host 动态库依赖 GNU/Linux glibc，须改为 Android 构建：{name}")
                elif source is not None:
                    with (source / name).open("rb") as original:
                        if sha256(stream) != sha256(original):
                            raise AssertionError(f"Host 文件与发布目录内容不一致：{name}")
        assert len(names) == metadata["fileCount"], "Host 文件数量与清单不一致"
        assert "lib/bin.js" in names and "package.json" in names, "官方 dsh 发布文件缺失"
        assert any(n.startswith("node_modules/") for n in names), "缺少发布依赖闭包"
    if source is not None:
        source_names = {p.relative_to(source).as_posix() for p in source.rglob("*") if p.is_file()}
        assert source_names == names, "Host 归档文件集与发布目录不一致"
    return {"format":metadata["format"],"files":len(names),"native":native_files,"uncompressed":total}

if __name__ == "__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("root",type=Path)
    ap.add_argument("--source",type=Path)
    ap.add_argument("--target",choices=("android-arm64","portable"),default="android-arm64")
    args=ap.parse_args()
    print(json.dumps(verify(args.root,args.source,args.target),ensure_ascii=False))
