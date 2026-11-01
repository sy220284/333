#!/usr/bin/env python3
"""Reproduce import-reference reachability from the privately held 2.1.310 JS archive.

The graph treats /$bunfs/root/chunk-*.js references as edges. It does not prove
runtime execution, authorization, behavior or semantic equivalence.
"""
import argparse
import collections
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHUNK = re.compile(r"\$bunfs/root/(chunk-[a-z0-9]+\.js)")


def scan(root: Path, anchors: list[dict]) -> list[dict]:
    assert root.is_dir(), f"Missing decompiled module directory: {root}"
    graph: dict[str, set[str]] = {}
    for file in sorted(root.glob("chunk-*.js")) + [root / "cli.js"]:
        if not file.is_file():
            raise FileNotFoundError(file)
        graph[file.name] = set(CHUNK.findall(file.read_text("utf-8", errors="replace")))
    parents: dict[str, str | None] = {"cli.js": None}
    queue = collections.deque(["cli.js"])
    while queue:
        node = queue.popleft()
        for next_node in sorted(graph[node]):
            if next_node not in graph:
                raise FileNotFoundError(f"Referenced chunk is not available: {node} -> {next_node}")
            if next_node in parents:
                continue
            parents[next_node] = node
            queue.append(next_node)

    results: list[dict] = []
    for a in anchors:
        module, line = a["first_code_anchor"].rsplit(":", 1)
        n = int(line)
        path = root / module
        lines = path.read_text("utf-8", errors="replace").splitlines()
        if n < 1 or n > len(lines) or a["static_keyword"].lower() not in lines[n - 1].lower():
            raise AssertionError(f"First anchor mismatch: {a['F_id']} -> {module}:{n}")
        if module not in parents:
            raise AssertionError(f"Unreachable by static reference graph: {a['F_id']} -> {module}")
        chain = [module]
        while parents[chain[-1]] is not None:
            chain.append(parents[chain[-1]])
        chain.reverse()
        results.append({
            "feature": a["F_id"], "anchor": a["first_code_anchor"],
            "reference_hops": len(chain) - 1,
            "static_reference_path": chain,
            "evidence_grade": "STATIC_REFERENCE_ONLY",
            "runtime_execution_verified": False,
        })
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--decompiled-dir", type=Path, required=True)
    parser.add_argument("--archive", type=Path, help="Optional original .tar.zst for SHA-256 source check")
    parser.add_argument("--output", type=Path, help="Optional JSON output; default stdout")
    args = parser.parse_args()
    source = json.loads((ROOT / "docs/upgrade/m1-evidence/source-provenance.json").read_text())
    anchors = json.loads((ROOT / "docs/upgrade/m1-evidence/new-code-anchors.json").read_text())["records"]
    if args.archive:
        with args.archive.open("rb") as handle:
            checksum = hashlib.file_digest(handle, "sha256").hexdigest()
        assert checksum == source["decompiled_library_sha256"], "Original archive differs from pinned SHA-256"
    assert len(anchors) == 61
    results = scan(args.decompiled_dir, anchors)
    assert len(results) == 61
    report = {
        "schema": 1, "target": "2.1.310",
        "source_archive_sha256": source["decompiled_library_sha256"],
        "code_anchors_checked": len(results), "reachable_anchors": len(results),
        "grade": "STATIC_REFERENCE_ONLY; not an actual callable-function chain or runtime test",
        "results": results,
    }
    output = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.write_text(output, "utf-8")
    else:
        print(output, end="")


if __name__ == "__main__":
    main()
