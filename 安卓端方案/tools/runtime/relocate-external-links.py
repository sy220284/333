#!/usr/bin/env python3
"""将 pnpm deploy 产物中指回受信任源码的链接实体化，生成完全离线的发布目录。

只处理独立部署目录内的链接，目标必须属于本次 checkout 声明的 pnpm 工作区。
部署目录内部的相对链接原样保留，由 package-host.py 统一审计并编码。
"""
import argparse
import json
import os
from pathlib import Path
import re
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

def workspace_package_manifests(checkout: Path) -> dict[str, tuple[Path, dict]]:
    """只解析 pnpm-workspace.yaml 中声明的源码工作区。"""
    patterns = (
        "packages/*/*/package.json", "apps/*/package.json",
        "vendor/*/package.json", "native/system/packages/*/package.json",
        "native/system/package.json", "python/sdk-runtime/package.json",
        "website/package.json", "benchmarks/package.json"
    )
    packages: dict[str, tuple[Path, dict]] = {}
    for pattern in patterns:
        for entry in checkout.glob(pattern):
            data = json.loads(entry.read_text(encoding="utf-8"))
            name = data.get("name")
            if name:
                if name in packages:
                    raise ValueError(f"重复的工作区包名: {name}")
                packages[name] = (entry.parent, data)
    return packages

def optional_platform_names(packages: dict[str, tuple[Path, dict]]) -> set[str]:
    return {
        name
        for _, metadata in packages.values()
        for name in metadata.get("optionalDependencies", {})
    }

def declared_missing_workspace_dependency(
    link: Path, deployment: Path, packages: dict[str, tuple[Path, dict]]
) -> Path | None:
    """缺失的内部链接只有在包声明明确引用官方工作区时才被实体化。"""
    if not link.parent.resolve(strict=True).is_relative_to(deployment):
        return None
    raw = Path(os.path.normpath(os.path.join(str(link.parent), os.readlink(link))))
    if not raw.is_relative_to(deployment):
        return None
    module_name = (link.parent.name + "/" + link.name
                   if link.parent.name.startswith("@") else link.name)
    source = packages.get(module_name)
    if source is None:
        return None
    current = link.parent
    while current != deployment:
        manifest_path = current / "package.json"
        if manifest_path.is_file():
            importer = json.loads(manifest_path.read_text(encoding="utf-8"))
            spec = importer.get("dependencies", {}).get(module_name)
            if spec is None:
                spec = importer.get("optionalDependencies", {}).get(module_name)
            if isinstance(spec, str) and spec.startswith(("workspace:", "link:")):
                print(f"MATERIALIZE declared workspace package: {module_name} ({link})")
                return source[0]
            return None
        current = current.parent
    return None

def installed_package_candidates(deployment: Path, name: str) -> list[Path]:
    """从 pnpm 已部署的实体包查找来源，避免猜测 registry 包版本。"""
    store = deployment / "node_modules" / ".pnpm"
    # 测试与部分工作区部署可没有虚拟仓库；调用方仍会按依赖清单严格判定缺失。
    if not store.is_dir():
        return []
    candidates = []
    for instance in store.iterdir():
        if not instance.is_dir() or instance.is_symlink():
            continue
        target = instance / "node_modules" / name
        manifest = target / "package.json"
        if target.is_dir() and not target.is_symlink() and manifest.is_file():
            metadata = json.loads(manifest.read_text(encoding="utf-8"))
            if metadata.get("name") == name:
                candidates.append(target)
    return candidates

def version_matches(request: str, version: str) -> bool:
    """保守验证常见 registry 范围；复杂约束须由 lockfile 的部署结果提供唯一实体。"""
    if request == "*":
        return True
    requested = request.lstrip("^~")
    if re.fullmatch(r"\d+\.\d+\.\d+", requested) is None:
        return False
    if re.fullmatch(r"\d+\.\d+\.\d+(?:-[\w.-]+)?", version) is None:
        return False
    target = tuple(map(int, requested.split(".")))
    actual = tuple(map(int, version.split("-")[0].split(".")))
    if request.startswith("^"):
        if target[0] > 0: return actual[0] == target[0] and actual >= target
        if target[1] > 0: return actual[:2] == target[:2] and actual >= target
        return actual == target
    if request.startswith("~"):
        return actual[:2] == target[:2] and actual >= target
    return actual == target

def declared_missing_registry_dependency(
    link: Path, deployment: Path, checkout: Path, packages: dict[str, tuple[Path, dict]]
) -> Path | None:
    """找回 pnpm --legacy deploy 的缺失镜像链接：只选择清单授权且版本匹配的实体。"""
    if not link.parent.resolve(strict=True).is_relative_to(deployment):
        return None
    name = link.parent.name + "/" + link.name if link.parent.name.startswith("@") else link.name
    current = link.parent
    while current != deployment:
        manifest = current / "package.json"
        if manifest.is_file():
            importer = json.loads(manifest.read_text(encoding="utf-8"))
            spec = importer.get("dependencies", {}).get(name)
            if spec is None:
                spec = importer.get("optionalDependencies", {}).get(name)
            if not isinstance(spec, str) or spec.startswith(("workspace:", "link:", "file:")):
                return None
            candidates: dict[str, list[Path]] = {}
            # pnpm --legacy deploy 可省略仓库锁定依赖的实体，但原 checkout 中
            # 已经按同一 frozen-lockfile 安装，仍能作为可信且可核对的来源。
            for store in (deployment, checkout):
                for candidate in installed_package_candidates(store, name):
                    details = json.loads((candidate / "package.json").read_text(encoding="utf-8"))
                    version = details.get("version", "")
                    if version_matches(spec, version):
                        candidates.setdefault(version, []).append(candidate.resolve(strict=True))
            if len(candidates) != 1:
                raise ValueError(f"包 {name} 的冻结依赖版本无法唯一校验: {spec} ({len(candidates)} 个版本)")
            selected = next(iter(candidates.values()))[0]
            if not (selected.is_relative_to(deployment) or selected.is_relative_to(checkout)):
                raise ValueError(f"npm 依赖实体越过本次构建目录: {selected}")
            print(f"MATERIALIZE locked registry dependency {name}@{spec} ({link})")
            return selected
        current = current.parent
    return None

def is_missing_platform_optional(link: Path, checkout: Path, optional_names: set[str]) -> bool:
    if "node_modules" not in link.parts:
        return False
    target = Path(os.path.normpath(os.path.join(str(link.parent), os.readlink(link))))
    missing = target.resolve(strict=False)
    # pnpm 的本地包别名可附带受控 peer 实例摘要。移除摘要后仅检查清单，
    # 不以别名存在作为授权；所有真实必要依赖仍须完整归档。
    name = missing.name
    match = re.fullmatch(r"(.+)\(([0-9a-f]{32})\)", name)
    if match is None:
        return False
    package_dir = missing.with_name(match.group(1))
    if not package_dir.is_relative_to(checkout / "packages"):
        return False
    manifest_path = package_dir / "package.json"
    if not manifest_path.is_file():
        return False
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    allowed = manifest.get("os")
    if not (manifest.get("name") in optional_names
            and isinstance(allowed, list) and allowed
            and set(allowed).issubset({"darwin", "win32"})):
        return False
    print(f"PRUNE unsupported optional package on Android: {manifest['name']} ({link})")
    return True

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
    packages = workspace_package_manifests(checkout)
    allowed_optionals = optional_platform_names(packages)
    replaced = 0
    restored = 0
    pruned = 0
    copied = 0
    while True:
        # 先处理最外层链接，防止遍历穿过未实体化的目录并误写回 checkout。
        paths = sorted((p for p in deployment.rglob("*") if p.is_symlink()),
                       key=lambda p: len(p.parts))
        paths = [p for p in paths if p.parent.resolve(strict=True).is_relative_to(deployment)]
        externals = []
        restored = []
        omitted = []
        for path in paths:
            try:
                destination = path.resolve(strict=True)
            except FileNotFoundError as error:
                if is_missing_platform_optional(path, checkout, allowed_optionals):
                    omitted.append(path)
                    continue
                source = declared_missing_workspace_dependency(path, deployment, packages)
                if source is None:
                    source = declared_missing_registry_dependency(path, deployment, checkout, packages)
                if source is not None:
                    restored.append((path, source))
                    continue
                raise ValueError(f"发布包存在未声明的缺失符号链接: {path}") from error
            except (OSError, RuntimeError) as error:
                raise ValueError(f"发布包存在失效或循环符号链接: {path}") from error
            if destination.is_relative_to(deployment):
                continue
            if not any(destination.is_relative_to(root) for root in trusted):
                raise ValueError(f"发布包链接逃出受信任源码: {path}")
            externals.append((path, destination))
        for path in omitted:
            path.unlink()
            pruned += 1
        if not externals and not restored:
            break
        for link, resolved in [*externals, *restored]:
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
    return {"relocated": replaced, "prunedPlatformOptionals": pruned, "copiedBytes": copied}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("deployment", type=Path)
    parser.add_argument("checkout", type=Path)
    args = parser.parse_args()
    print(relocate(args.deployment, args.checkout))
