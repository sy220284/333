import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, statSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

const root=resolve(import.meta.dirname,'..'),dist=join(root,'dist');
const metadata=JSON.parse(readFileSync(join(dist,'integrity.json'),'utf8'));
test('release package contains all 13 platform vendor files', () => {
  assert.equal(metadata.files.filter(f=>f.path.startsWith('vendor/')).length,13);
  assert.ok(existsSync(join(dist,'cli.js')));
  assert.ok(existsSync(join(dist,'launcher.cjs')));
});
test('every packaged file matches signed-style SHA-256 content manifest', () => {
  for(const f of metadata.files) {
    const full=resolve(dist,f.path);
    assert.ok(full.startsWith(dist+'/') || full.startsWith(dist+'\\'), f.path);
    assert.equal(statSync(full).size,f.bytes);
    assert.equal(createHash('sha256').update(readFileSync(full)).digest('hex'),f.sha256,f.path);
  }
});
test('new distributable CLI is distinct from original binary', () => {
  const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
  assert.notEqual(hash(join(root,'cli.js')),hash(join(dist,'cli.js')));
});
test('installed launcher invokes newly built CLI', () => {
  const p=spawnSync(process.execPath,[join(dist,'launcher.cjs'),'--version'],{encoding:'utf8',timeout:15000});
  assert.equal(p.status,0,p.stderr);
  assert.match(p.stdout,/2\.1\.88 \(Claude Code\)/);
});

test('release is runnable from an isolated folder without repository node_modules', () => {
  const sandbox = mkdtempSync(join(tmpdir(), '333-distributable-'));
  try {
    const installed = join(sandbox, 'installed');
    cpSync(dist, installed, { recursive: true });
    for (const args of [['--version'], ['--help'], ['auth', '--help'], ['mcp', '--help']]) {
      const p = spawnSync('bun', [join(installed, 'cli.js'), ...args], {
        cwd: sandbox,
        encoding: 'utf8',
        timeout: 25000,
        env: { ...process.env, DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
        maxBuffer: 3 * 1024 * 1024
      });
      assert.equal(p.error, undefined, p.error?.message);
      assert.equal(p.status, 0, JSON.stringify({ args, stdout: p.stdout?.slice(-1200), stderr: p.stderr?.slice(-1200) }));
      if (args[0] === '--version') assert.match(p.stdout, /2\.1\.88 \(Claude Code\)/);
      else assert.match(p.stdout, /Usage:/);
    }
    const p = spawnSync(process.execPath, [join(installed, 'launcher.cjs'), '--version'], {
      cwd: sandbox, encoding: 'utf8', timeout: 25000,
    });
    assert.equal(p.status, 0, p.stderr);
    assert.match(p.stdout, /2\.1\.88 \(Claude Code\)/);
  } finally {
    rmSync(sandbox, {recursive: true, force: true});
  }
});
