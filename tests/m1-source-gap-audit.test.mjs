import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const script = resolve(import.meta.dirname, '../build/m1-source-gap-audit.py');

test('旧版缺失模块必须区分映射原文、现存实现与真正缺失', () => {
  const root = mkdtempSync(join(tmpdir(), 'm1-source-gap-'));
  try {
    const oldSrc = join(root, 'old', 'src');
    const currentSrc = join(root, 'current', 'src');
    mkdirSync(oldSrc, { recursive: true });
    mkdirSync(currentSrc, { recursive: true });
    writeFileSync(join(oldSrc, 'main.ts'), [
      "import type { A } from './missing.js'",
      "import { ready } from './present.js'",
      "import { ghost } from './ghost.js'",
      '',
    ].join('\n'));
    writeFileSync(join(oldSrc, 'present.ts'), 'export const ready = true;\n');
    writeFileSync(join(currentSrc, 'missing.ts'), 'export type A = string;\n');
    const map = join(root, 'cli.js.map');
    const out = join(root, 'result.json');
    writeFileSync(map, JSON.stringify({
      sources: ['../src/missing.ts'], sourcesContent: ['export type A = string'],
    }));
    execFileSync('python3', [
      script, '--old-src', oldSrc, '--current-src', currentSrc,
      '--source-map', map, '--out', out,
    ], { encoding: 'utf8', timeout: 10000 });
    const result = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(result.resolved_references, 1);
    assert.equal(result.missing_paths, 2);
    assert.equal(result.missing_references, 2);
    assert.equal(result.current_exists, 1);
    assert.equal(result.map_recoverable, 1);
    assert.equal(result.records.find(x => x.path === 'ghost.js').current_source_exists, false);
    assert.equal(result.records.find(x => x.path === 'missing.js').source_map[0].has_content, true);
    assert.equal(result.evidence_grade, 'STATIC_IMPORT_ONLY');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
