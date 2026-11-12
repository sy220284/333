#!/usr/bin/env python3
"""将 pnpm deploy 产物中指回受信任源码的链接实体化，生成完全离线的发布目录。

只处理位于独立部署目录内的链接，目标必须属于本次 checkout 的 vendor/packages/native/apps。
部署目录内部的相对链接原样保留，由 package-host.py 统一审计并编码。
"""
import argparse
import os
from pathlib import Path
import shutil

MAX_RELOCATIONS = 20000
MAX_COPIED_BYTES = 1200000000

def directory_bytes(path: Path) -> int:
    total = 0
    for current, dirs, files in os.walk(path, followlinks=False):
        for name in files:
            file = Path(current) / name
            if file.is_file() and not file.is_symlink():
                total += file.stat().st_size
    return total

def relocate(deployment: Path, checkout: Path) -> dict:
    deployment = deployment.resolve(strict=True)
    checkout = checkout.resolve(strict=True)
    if deployment == checkout or deployment.is_relative_to(checkout):
        raise ValueError("Host 临时部署目录必须位于工作区外")
    if not (deployment / "package.json").is_file():
        raise ValueError("缺少可部署的 Host 根包")
    trusted = [checkout / name for name in ("vendor", "packages", "native", "apps", "python", "website", "benchmarks")]
    for root in trusted:
        if not root.is_dir():
            raise ValueError(f"缺少受信任的源码域: {root.name}")
    replaced = 0
    copied = 0
    while True:
        paths = [p for p in deployment.rglob("*") if p.is_symlink()]
        externals = []
        for path in paths:
            try:
                destination = path.resolve(strict=True)
            except (OSError, RuntimeError) as error:
                raise ValueError(f"发布包存在失效或循环符号链接: {path}") from error
            if destination.is_relative_to(deployment):
                continue
            if not any(destination.is_relative_to(root) for root in trusted):
                raise ValueError(f"发布包链接逃出受信任源码: {path}")
            externals.append((path, destination))
        if not externals:
            break
        for link, resolved in externals:
            if not link.is_symlink():
                continue
            replaced += 1
            if replaced > MAX_RELOCATIONS:
                raise ValueError("Host 外部链接过多，拒绝无界递归")
            additional = directory_bytes(resolved) if resolved.is_dir() else resolved.stat().st_size
            copied += additional
            if copied > MAX_COPIED_BYTES:
                raise ValueError("工作区依赖实体化体积超过审计上限")
            link.unlink()
            if resolved.is_dir():
                shutil.copytree(resolved, link, symlinks=True)
            elif resolved.is_file():
                shutil.copy2(resolved, link)
            else:
                raise ValueError(f"外部链接目标并非文件或目录: {resolved}")
    return {"relocated": replaced, "copiedBytes": copied}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("deployment", type=Path)
    parser.add_argument("checkout", type=Path)
    args = parser.parse_args()
    print(relocate(args.deployment, args.checkout))
