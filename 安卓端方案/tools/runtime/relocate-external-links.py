#!/usr/bin/env python3
"""将 pnpm deploy 产物中指回受信任源码的链接实体化，生成完全离线的发布目录。

只处理独立部署目录内的链接，目标必须属于本次 checkout 声明的 pnpm 工作区。
部署目录内部的相对链接原样保留，由 package-host.py 统一审计并编码。
"""
import argparse
import hashlib
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
            if spec is None:
                spec = importer.get("peerDependencies", {}).get(module_name)
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
    # 精确的预发布锁定版本必须按完整标识比较，不能去掉 -beta.*。
    if re.fullmatch(r"\d+\.\d+\.\d+-[\w.-]+", request):
        return version == request
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

def locked_workspace_dependency_version(
    checkout: Path, importer: dict, name: str, packages: dict[str, tuple[Path, dict]]
) -> str | None:
    """按同一 frozen pnpm-lock.yaml 的 importer 精确定位版本。

    版本范围可能同时容纳多个实体，例如 ^4.0.3 同时匹配 4.0.4 和 4.0.7。
    对工作区包按其真实源码路径查锁定版本，避免复制错误的生产依赖。
    """
    source = packages.get(importer.get("name"))
    if source is None:
        return None
    lockfile = checkout / "pnpm-lock.yaml"
    if not lockfile.is_file():
        return None
    key = source[0].relative_to(checkout).as_posix()
    in_importers = False
    importer_key = None
    dependency_group = None
    dependency_name = None
    for line in lockfile.read_text(encoding="utf-8").splitlines():
        if line == "importers:":
            in_importers = True
            continue
        if not in_importers:
            continue
        if line in ("packages:", "snapshots:"):
            break
        if line.startswith("  ") and not line.startswith("    ") and line.endswith(":"):
            importer_key = line.strip()[:-1].strip("'\\\"")
            dependency_group = None
            dependency_name = None
        elif importer_key == key and line.startswith("    ") and not line.startswith("      ") and line.endswith(":"):
            dependency_group = line.strip()[:-1]
            dependency_name = None
        elif importer_key == key and dependency_group in ("dependencies", "optionalDependencies") and line.startswith("      ") and not line.startswith("        ") and line.endswith(":"):
            dependency_name = line.strip()[:-1].strip("'\\\"")
        elif importer_key == key and dependency_name == name and line.startswith("        version:"):
            version = line.partition(":")[2].strip().strip("'\\\"").split("(")[0]
            if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[\w.-]+)?", version):
                raise ValueError(f"锁文件的依赖版本无效: {name}={version}")
            return version
    return None

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
            if spec is None:
                spec = importer.get("peerDependencies", {}).get(name)
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
            locked_version = locked_workspace_dependency_version(checkout, importer, name, packages)
            if locked_version is not None:
                if not version_matches(spec, locked_version):
                    raise ValueError(f"包 {name} 的锁文件版本与依赖声明不一致: {spec} / {locked_version}")
                candidates = {version: paths for version, paths in candidates.items()
                              if version == locked_version}
            if len(candidates) != 1:
                raise ValueError(
                    f"包 {name} 的冻结依赖版本无法唯一校验: {spec} "
                    f"(锁文件={locked_version}, 候选版本={sorted(candidates)}, 链接={link})")
            selected = next(iter(candidates.values()))[0]
            if not (selected.is_relative_to(deployment) or selected.is_relative_to(checkout)):
                raise ValueError(f"npm 依赖实体越过本次构建目录: {selected}")
            print(f"MATERIALIZE locked registry dependency {name}@{spec} ({link})")
            return selected
        current = current.parent
    return None

def is_missing_development_only_dependency(link: Path, deployment: Path) -> bool:
    """仅清理明确属于 devDependencies 且生产清单未声明的破损链接。"""
    parent = link.parent
    if not parent.resolve(strict=True).is_relative_to(deployment):
        return False
    name = parent.name + "/" + link.name if parent.name.startswith("@") else link.name
    current = parent
    while current != deployment:
        manifest = current / "package.json"
        if manifest.is_file():
            data = json.loads(manifest.read_text(encoding="utf-8"))
            declared_dev = name in data.get("devDependencies", {})
            declared_prod = (name in data.get("dependencies", {}) or
                             name in data.get("optionalDependencies", {}) or
                             name in data.get("peerDependencies", {}))
            if declared_dev and not declared_prod:
                print(f"PRUNE development-only link: {name} ({link})")
                return True
            return False
        current = current.parent
    return False

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

def unpublished_test_fixture(link: Path, deployment: Path) -> bool:
    """只清理真实发布清单排除的根级测试目录；生产入口与资源受保护。"""
    current = link.parent
    while current.is_relative_to(deployment):
        manifest = current / "package.json"
        if manifest.is_file():
            data = json.loads(manifest.read_text(encoding="utf-8"))
            files = data.get("files")
            if not isinstance(files, list) or not all(isinstance(item, str) for item in files):
                return False
            relative = link.relative_to(current).parts
            if len(relative) < 2 or relative[0] not in ("tests", "__tests__"):
                return False
            prefix = relative[0]
            if any(item == "*" or item.startswith("**") or
                   item == prefix or item.startswith(prefix + "/") or
                   item.startswith("{" + prefix) for item in files):
                return False
            print(f"PRUNE unpublished test fixture link: {link}")
            return True
        if current == deployment:
            break
        current = current.parent
    return False


def prune_unpublished_test_trees(deployment: Path) -> int:
    """pnpm legacy deploy 复制出的 tests 不属于 package.json 发布文件集。"""
    count = 0
    for manifest in sorted(deployment.rglob("package.json")):
        package = manifest.parent
        if package.is_symlink() or not package.resolve(strict=True).is_relative_to(deployment):
            continue
        metadata = json.loads(manifest.read_text(encoding="utf-8"))
        files = metadata.get("files")
        if not isinstance(files, list) or not all(isinstance(item, str) for item in files):
            continue
        for folder in ("tests", "__tests__"):
            if any(item == "*" or item.startswith("**") or
                   item == folder or item.startswith(folder + "/") or
                   item.startswith("{" + folder) for item in files):
                continue
            candidate = package / folder
            if candidate.is_symlink():
                continue
            if candidate.is_dir():
                shutil.rmtree(candidate)
                count += 1
    return count


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
    pruned = 0
    copied = 0
    # 每份可信包只复制一次。其余引用使用发布包内的相对链接。
    # 旧实现按引用位置整包复制，造成递归依赖的指数级体积膨胀。
    staging = deployment / "node_modules" / ".333-closure"
    if staging.exists() or staging.is_symlink():
        raise ValueError("发布目录的闭包暂存区已存在，拒绝覆盖")
    staging.mkdir()
    copied_sources: dict[Path, Path] = {}
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
                if (is_missing_platform_optional(path, checkout, allowed_optionals) or
                        is_missing_development_only_dependency(path, deployment) or
                        unpublished_test_fixture(path, deployment)):
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
            source = resolved.resolve(strict=True)
            if source.is_relative_to(deployment):
                destination = source
            else:
                if not any(source.is_relative_to(root) for root in trusted):
                    raise ValueError(f"依赖来源越过受信任源码目录: {source}")
                destination = copied_sources.get(source)
                if destination is None:
                    additional = directory_bytes(source) if source.is_dir() else source.stat().st_size
                    if copied + additional > MAX_COPIED_BYTES:
                        raise ValueError("工作区依赖实体化体积超过审计上限")
                    identifier = hashlib.sha256(str(source).encode("utf-8")).hexdigest()[:24]
                    destination = staging / identifier
                    if destination.exists() or destination.is_symlink():
                        raise ValueError(f"依赖闭包标识冲突: {source}")
                    if source.is_dir():
                        shutil.copytree(source, destination, symlinks=True)
                    elif source.is_file():
                        shutil.copy2(source, destination)
                    else:
                        raise ValueError(f"依赖目标不是文件或目录: {source}")
                    copied_sources[source] = destination
                    copied += additional
            link.unlink()
            link.symlink_to(os.path.relpath(destination, link.parent),
                            target_is_directory=destination.is_dir())
    omitted_trees = prune_unpublished_test_trees(deployment)
    return {"relocated": replaced, "uniqueSources": len(copied_sources),
            "prunedPlatformOptionals": pruned,
            "prunedTestTrees": omitted_trees, "copiedBytes": copied}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("deployment", type=Path)
    parser.add_argument("checkout", type=Path)
    args = parser.parse_args()
    print(relocate(args.deployment, args.checkout))
