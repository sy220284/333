#!/usr/bin/env python3
"""一次性提取 Claude Code 2.1.317 Linux x64 官方 ELF 中的全部 Bun 模块。

输出保留逐字节原样与可尝试直接运行的相对路径 ESM 两层；二者严格区分。
没有经过真实运行测试的 ESM 只标为候选，绝不自动接管 333 的 CLI。
"""
import argparse
import hashlib
import json
import mmap
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import subprocess
import tempfile

VERSION = '2.1.317'
BINARY_SHA256 = 'eb224419e344575faa4a1f39b290b649425a10cd5ee2ef1d003480cd9ae57eb0'
EXPECTED_MODULES = 2924
HEADER = struct.Struct('<QIIIIII')
RECORD = struct.Struct('<12I4B')
KINDS = {(1,1,1,0): 'js', (1,13,0,1): 'text', (2,13,0,1): 'text', (0,10,0,1): 'napi', (0,5,0,1): 'file'}
REF = re.compile(r'([\"\'])/\$bunfs/root/([A-Za-z0-9_./-]+)\1')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def elf_bun_section(mm):
    if mm[:4] != b'\x7fELF' or mm[4] != 2 or mm[5] != 1:
        raise ValueError('Require ELF64 little-endian executable')
    shoff = struct.unpack_from('<Q', mm, 40)[0]
    shentsize, shnum, shstridx = struct.unpack_from('<HHH', mm, 58)
    if shoff + shnum * shentsize > len(mm) or shstridx >= shnum or shentsize < 64:
        raise ValueError('Invalid ELF section table')
    st = shoff + shstridx * shentsize
    string_off, string_size = struct.unpack_from('<QQ', mm, st + 24)
    if string_off + string_size > len(mm):
        raise ValueError('Invalid ELF section-name table')
    names = mm[string_off:string_off + string_size]
    for i in range(shnum):
        off = shoff + i * shentsize
        nameid = struct.unpack_from('<I', mm, off)[0]
        if nameid >= len(names):
            raise ValueError('Invalid ELF section name')
        end = names.find(b'\0', nameid)
        if end == -1:
            raise ValueError('Unterminated ELF section name')
        if names[nameid:end] == b'.bun':
            sizeoff, size = struct.unpack_from('<QQ', mm, off + 24)
            if sizeoff + size > len(mm):
                raise ValueError('Invalid Bun section range')
            return sizeoff, size
    raise ValueError('ELF has no .bun section')


def rewrite_paths(contents, path):
    def replace(match):
        reference = PurePosixPath(match.group(2))
        here = PurePosixPath(path).parent
        target = os.path.relpath(str(reference), str(here) if str(here) != '.' else '.')
        if not target.startswith('.'):
            target = './' + target
        return match.group(1) + target.replace('\\', '/') + match.group(1)
    return REF.sub(replace, contents)


def import_binary(binary, dest):
    with binary.open('rb') as fh:
        with mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ) as mm:
            if digest(mm) != BINARY_SHA256:
                raise ValueError('Official 2.1.317 Linux x64 binary SHA-256 mismatch')
            base, size = elf_bun_section(mm)
            payload_size = struct.unpack_from('<Q', mm, base)[0]
            if payload_size != size - 8:
                raise ValueError('Invalid Bun payload header')
            count, table_offset, table_size, entrypoint, argv_offset, argv_size, flags = HEADER.unpack_from(mm, base + size - 48)
            if count != size - 56 or table_size % RECORD.size or table_size // RECORD.size != EXPECTED_MODULES:
                raise ValueError('Invalid Bun module table')
            if table_offset + table_size > payload_size or entrypoint >= EXPECTED_MODULES:
                raise ValueError('Invalid Bun module table boundaries')
            raw = dest / 'source'
            modules = dest / 'modules'
            decoded = dest / 'decoded'
            raw.mkdir(parents=True)
            modules.mkdir(parents=True)
            decoded.mkdir(parents=True)
            records = []
            names = set()
            for index in range(EXPECTED_MODULES):
                values = RECORD.unpack_from(mm, base + 8 + table_offset + index * RECORD.size)
                spans = [tuple(values[j:j+2]) for j in range(0, 12, 2)]
                for position, length in spans:
                    if position + length > payload_size:
                        raise ValueError(f'Module {index} range outside .bun payload')
                no, nl = spans[0]
                name = mm[base + 8 + no:base + 8 + no + nl].decode('utf8')
                if not name.startswith('/$bunfs/root/'):
                    raise ValueError('Unexpected original module path')
                name = name[len('/$bunfs/root/'):]
                pure = PurePosixPath(name)
                if pure.is_absolute() or any(x in ('..', '.') for x in pure.parts) or not name or name in names:
                    raise ValueError(f'Unsafe or duplicate module path: {name}')
                names.add(name)
                key = tuple(values[12:16])
                if key not in KINDS:
                    raise ValueError(f'Unknown Bun module kind at {index}: {key}')
                do, dl = spans[1]
                content = mm[base + 8 + do:base + 8 + do + dl]
                original = raw / name
                original.parent.mkdir(parents=True, exist_ok=True)
                original.write_bytes(content)
                candidate = modules / (name + '.mjs' if name == 'cli' else name)
                candidate.parent.mkdir(parents=True, exist_ok=True)
                if KINDS[key] == 'js':
                    try:
                        revised = rewrite_paths(content.decode('utf8'), name)
                        candidate.write_text(revised, encoding='utf8')
                    except UnicodeDecodeError as exc:
                        raise ValueError(f'Invalid JS UTF-8: {name}') from exc
                else:
                    candidate.write_bytes(content)
                record = {'index': index, 'path': name, 'kind': KINDS[key], 'size': len(content),
                          'source_sha256': digest(content), 'candidate_sha256': digest(candidate.read_bytes()),
                          'offset': base + 8 + do, 'entrypoint': index == entrypoint}
                if name.endswith('.zst'):
                    if shutil.which('zstd') is None:
                        raise RuntimeError('zstd CLI required to decode embedded .zst resources')
                    result = subprocess.run(['zstd', '-d', '-q', '-c'], input=content, capture_output=True)
                    if result.returncode:
                        raise RuntimeError(f'zstd failed on {name}: {result.stderr.decode(errors="replace")}')
                    uncompressed = decoded / name[:-4]
                    uncompressed.parent.mkdir(parents=True, exist_ok=True)
                    uncompressed.write_bytes(result.stdout)
                    record['decoded_sha256'] = digest(result.stdout)
                    record['decoded_size'] = len(result.stdout)
                records.append(record)
            if records[entrypoint]['path'] != 'cli':
                raise ValueError('Unexpected Bun CLI entrypoint')
            manifest = {'version': VERSION, 'platform': 'linux-x64', 'binary_sha256': BINARY_SHA256,
                        'bun_offset': base, 'bun_size': size, 'module_count': len(records),
                        'kinds': {k: sum(r['kind'] == k for r in records) for k in set(KINDS.values())},
                        'description': 'source: exact bytes; modules: path-rewritten candidate, not yet runtime-verified; decoded: zstd output',
                        'files': records}
            (dest / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    verify(dest)
    return manifest


def verify(dest):
    manifest = json.loads((dest / 'manifest.json').read_text('utf8'))
    if manifest['version'] != VERSION or manifest['binary_sha256'] != BINARY_SHA256 or manifest['module_count'] != EXPECTED_MODULES:
        raise ValueError('Snapshot version / count / checksum mismatch')
    for item in manifest['files']:
        for folder, fn, key in [('source', item['path'], 'source_sha256'),
                                ('modules', item['path'] + '.mjs' if item['path'] == 'cli' else item['path'], 'candidate_sha256')]:
            file = dest / folder / fn
            if not file.is_file() or digest(file.read_bytes()) != item[key]:
                raise ValueError(f'Snapshot file changed: {folder}/{fn}')
        if 'decoded_sha256' in item:
            file = dest / 'decoded' / item['path'][:-4]
            if not file.is_file() or digest(file.read_bytes()) != item['decoded_sha256']:
                raise ValueError(f'Decoded resource changed: {item["path"]}')
    return manifest


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--binary', type=Path, help='The verified 2.1.317 package/claude Linux x64 ELF')
    ap.add_argument('--out', type=Path, default=Path('vendor/claude-code-2.1.317'))
    ap.add_argument('--verify-only', action='store_true')
    args = ap.parse_args()
    dest = args.out.expanduser().resolve()
    if args.verify_only:
        result = verify(dest)
    else:
        if not args.binary or not args.binary.is_file():
            ap.error('--binary must point to the official ELF executable')
        if dest.exists():
            raise FileExistsError(f'Import destination already exists: {dest}. Move it away before reimporting.')
        dest.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=dest.parent, prefix='.claude317-import-') as scratch:
            result = import_binary(args.binary.resolve(), Path(scratch))
            Path(scratch).rename(dest)
    print(json.dumps({'version': result['version'], 'module_count': result['module_count'], 'kinds': result['kinds'],
                      'decoded_resources': sum('decoded_sha256' in x for x in result['files']),
                      'path': str(dest), 'validated': True}, ensure_ascii=False))


if __name__ == '__main__':
    main()