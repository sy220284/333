#!/usr/bin/env python3
"""打包官方 dsh deploy 目录：每个字节可审计，拒绝软链接和越界路径。"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import zipfile

def package_host(source: Path, out: Path) -> dict:
    source = source.resolve(strict=True)
    if not (source / "lib/bin.js").is_file() or not (source / "node_modules").is_dir():
        raise ValueError("官方 dsh 发布物缺少 lib/bin.js 或 node_modules")
    files = sorted(p for p in source.rglob("*") if p.is_file() or p.is_symlink())
    regular = []
    links = {}
    for item in files:
        if not item.is_symlink():
            regular.append(item)
            continue
        link_name = item.relative_to(source).as_posix()
        link_target = os.readlink(item)
        if os.path.isabs(link_target) or "\\" in link_target:
            raise ValueError(f"发布物含绝对或非POSIX符号链接: {link_name}")
        try:
            resolved = item.resolve(strict=True)
        except (OSError, RuntimeError) as error:
            raise ValueError(f"发布物存在失效或循环符号链接: {link_name}") from error
        if not resolved.is_relative_to(source):
            raise ValueError(f"发布物符号链接越界: {link_name}")
        links[link_name] = link_target
    archive = out / "assets/runtime/host/package.zip"
    archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as zipout:
        for p in regular:
            name = p.relative_to(source).as_posix()
            if name.startswith("/") or ".." in Path(name).parts:
                raise ValueError(f"非法资源名: {name}")
            zipout.write(p, name)
    sha = hashlib.sha256()
    with archive.open("rb") as f:
        while part := f.read(1048576):
            sha.update(part)
    manifest = dict(format="333-host-v1", version=json.loads((source / "package.json").read_text())["version"],
                    entry="lib/bin.js", bytes=archive.stat().st_size, sha256=sha.hexdigest(),
                    fileCount=len(regular), links=links, source="@deepseek-ai/dsh")
    dest = out / "assets/runtime/dsh-host-manifest.json"
    dest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True)+"\n")
    return manifest

if __name__ == "__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("source",type=Path)
    parser.add_argument("output",type=Path)
    args=parser.parse_args()
    print(json.dumps(package_host(args.source,args.output)))
