#!/usr/bin/env python3
"""M1 旧版源码的相对导入缺口索引，结果仅表示静态候选。"""
import argparse
import json
import posixpath
import re
from collections import defaultdict
from pathlib import Path

IMPORT = re.compile(r'''(?:from\s*|import\s*\(|require\s*\(|\bimport\s+)(?:\s*)['"](\.{1,2}/[^'"\n]+)['"]''')
EXTS = ('.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.d.ts', '.d.mts', '.d.cts')


def candidates(path):
    found = [path]
    if path.endswith(('.js', '.mjs', '.cjs')):
        found.extend(path.rsplit('.', 1)[0] + ext for ext in EXTS)
    elif not posixpath.splitext(path)[1]:
        found.extend(path + ext for ext in EXTS)
        found.extend(posixpath.join(path, 'index' + ext) for ext in EXTS)
    return list(dict.fromkeys(found))


def audit(old_src, current_src=None, source_map=None):
    files = {
        f.relative_to(old_src).as_posix(): f
        for f in old_src.rglob('*')
        if f.is_file() and f.suffix in ('.ts', '.tsx', '.js', '.mjs', '.mts', '.cts')
    }
    old_all = {f.relative_to(old_src).as_posix() for f in old_src.rglob('*') if f.is_file()}
    mapped = {}
    if source_map:
        source = json.loads(source_map.read_text('utf-8'))
        if len(source.get('sources', [])) != len(source.get('sourcesContent', [])):
            raise ValueError('Source Map sources 与 sourcesContent 长度不一致')
        for path, content in zip(source['sources'], source['sourcesContent']):
            mapped[posixpath.normpath(path.replace('\\', '/')).lstrip('./')] = isinstance(content, str)
    gaps = defaultdict(list)
    resolved = 0
    for rel, file in sorted(files.items()):
        data = file.read_text('utf-8', errors='replace')
        for match in IMPORT.finditer(data):
            request = match.group(1)
            target = posixpath.normpath(posixpath.join(posixpath.dirname(rel), request))
            paths = candidates(target)
            if any(path in old_all for path in paths):
                resolved += 1
                continue
            line = data.count('\n', 0, match.start()) + 1
            context = data[max(0, match.start()-64):match.end()]
            hint = 'type-like' if re.search(r'\b(import|export)\s+type\b|\btypeof\s+import\b', context) else 'needs-ast-review'
            gaps[target].append({'importer': rel, 'line': line, 'request': request, 'kind_hint': hint})
    records = []
    for path, sites in sorted(gaps.items(), key=lambda x: (-len(x[1]), x[0])):
        paths = candidates(path)
        matches = []
        for candidate in paths:
            for source_path, has_content in mapped.items():
                if source_path == candidate or source_path.endswith('/src/' + candidate) or source_path.endswith('/' + candidate):
                    matches.append({'source': source_path, 'has_content': has_content})
        records.append({
            'path': path, 'references': len(sites), 'evidence_grade': 'STATIC_IMPORT_ONLY',
            'current_source_exists': bool(current_src and any((current_src / x).is_file() for x in paths)),
            'source_map': matches, 'importers': sites,
        })
    return {
        'schema': 1, 'evidence_grade': 'STATIC_IMPORT_ONLY',
        'resolved_references': resolved, 'missing_paths': len(records),
        'missing_references': sum(x['references'] for x in records),
        'current_exists': sum(bool(x['current_source_exists']) for x in records),
        'map_recoverable': sum(any(y['has_content'] for y in x['source_map']) for x in records),
        'records': records,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--old-src', type=Path, required=True)
    parser.add_argument('--current-src', type=Path)
    parser.add_argument('--source-map', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if not args.old_src.is_dir():
        parser.error('旧版 source/src 不存在')
    result = audit(args.old_src, args.current_src, args.source_map)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k != 'records'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
