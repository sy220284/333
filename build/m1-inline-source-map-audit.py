#!/usr/bin/env python3
"""M1: 从 2.1.88 源文件的内嵌 Source Map 恢复原始 TS/TSX 快照（默认仅生成摘要）。

快照属于旧版，不应写回当前产品源码。任何解码错误均直接失败。
"""
import argparse
import base64
import hashlib
import json
import re
from pathlib import Path

SOURCE_MAP = re.compile(
    r"sourceMappingURL=data:application/json(?:;charset=utf-8)?;base64,([^\\s]+)"
)
SOURCE_MAP_PREFIX = "sourceMappingURL=data:application/json"
EXTENSIONS = {".ts", ".tsx", ".js", ".mjs", ".mts", ".cts"}


def audit(root: Path, recover_to: Path | None = None) -> dict:
    if not root.is_dir():
        raise FileNotFoundError(f"原始源码目录不存在: {root}")
    count = 0
    recovered = 0
    char_count = 0
    byte_count = 0
    records = []
    for file in sorted(root.rglob("*")):
        if not file.is_file() or file.suffix not in EXTENSIONS:
            continue
        relative = file.relative_to(root).as_posix()
        text = file.read_text("utf-8")
        match = SOURCE_MAP.search(text)
        if not match:
            if SOURCE_MAP_PREFIX in text:
                raise ValueError(f"检测到损坏或不受支持的内嵌 Source Map: {relative}")
            continue
        if len(SOURCE_MAP.findall(text)) != 1:
            raise ValueError(f"同一文件出现多个内嵌 Source Map，必须人工核实: {relative}")
        count += 1
        raw = base64.b64decode(match.group(1), validate=True)
        source_map = json.loads(raw)
        sources = source_map.get("sources")
        contents = source_map.get("sourcesContent")
        if not isinstance(sources, list) or not isinstance(contents, list) or len(sources) != len(contents):
            raise ValueError(f"内嵌 Source Map 结构/长度错误: {relative}")
        if not sources:
            raise ValueError(f"缺少原始 sources: {relative}")
        items = []
        for idx, (source_path, source_text) in enumerate(zip(sources, contents)):
            if not isinstance(source_path, str) or not isinstance(source_text, str):
                raise ValueError(f"Source Map 存在没有原文的映射: {relative}#{idx}")
            sha256 = hashlib.sha256(source_text.encode("utf-8")).hexdigest()
            source_bytes = len(source_text.encode("utf-8"))
            recovered += 1
            char_count += len(source_text)
            byte_count += source_bytes
            items.append({
                "index": idx,
                "original_source_path": source_path,
                "source_sha256": sha256,
                "original_characters": len(source_text),
                "original_bytes": source_bytes,
            })
            if recover_to is not None:
                # Output uses the verified input file's relative path, never
                # an untrusted map's source URL (can contain ../../).
                target = recover_to / relative / f"source-{idx}{Path(source_path).suffix or '.ts'}"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(source_text, "utf-8")
        records.append({
            "compiled_path": relative,
            "compiled_sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
            "source_count": len(items),
            "sources": items,
            "evidence_grade": "EMBEDDED_ORIGINAL_SOURCE_SNAPSHOT",
        })
    return {
        "schema": 1,
        "scope": "2.1.88 original source snapshot, not current branch runtime evidence",
        "files_with_inline_maps": count,
        "original_sources_recovered": recovered,
        "original_characters": char_count,
        "original_bytes": byte_count,
        "records": records,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--recover-dir", type=Path, help="可选：将旧版原始源码快照写到独立目录，不覆盖当前 src")
    args = parser.parse_args()
    source = args.source_dir.resolve()
    if args.recover_dir:
        target = args.recover_dir.resolve()
        if target == source or source in target.parents or target in source.parents:
            parser.error("恢复目录必须独立于旧源码目录，禁止原地覆盖")
    report = audit(source, args.recover_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "records"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
