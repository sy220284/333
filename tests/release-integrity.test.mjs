import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, cpSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import './m1-vendor-packaging-317.test.mjs';
import './m1-native-clipboard-317.test.mjs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

const root=resolve(import.meta.dirname,'..'),dist=join(root,'dist');
const expectedVersion=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
const metadata=JSON.parse(readFileSync(join(dist,'integrity.json'),'utf8'));
function vendorFiles(dir, prefix='vendor') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const currentPath = join(dir, entry.name);
    const rel = prefix + '/' + entry.name;
    if (entry.isDirectory()) return vendorFiles(currentPath, rel);
    assert.equal(entry.isFile(), true, `Non-file native resource: ${rel}`);
    return [rel];
  }).sort();
}
test('release vendor inventory matches exactly the current source tree', () => {
  assert.equal(metadata.version, expectedVersion);
  const sourceFiles = vendorFiles(join(root, 'vendor'));
  const packagedFiles = vendorFiles(join(dist, 'vendor'));
  const indexedFiles = metadata.files.filter(f=>f.path.startsWith('vendor/')).map(f=>f.path).sort();
  assert.deepEqual(packagedFiles, sourceFiles);
  assert.deepEqual(indexedFiles, sourceFiles);
  assert.ok(existsSync(join(dist,'cli.js')));
  assert.ok(existsSync(join(dist,'launcher.cjs')));
});
test('official 2.1.317 Linux x64 native resources survive packaging and load in Node', {
  skip: !(process.platform === 'linux' && process.arch === 'x64'),
}, () => {
  const pinned = JSON.parse(readFileSync(join(root, 'build/official-native-317.json'), 'utf8'));
  assert.equal(pinned.version, expectedVersion);
  assert.equal(pinned.platform, 'x64-linux');
  const load = createRequire(import.meta.url);
  for (const mod of pinned.modules) {
    const full = join(dist, 'vendor', mod.name.slice(0, -5), pinned.platform, mod.name);
    assert.ok(existsSync(full), `Missing official native module: ${mod.name}`);
    const bytes = readFileSync(full);
    assert.equal(bytes.length, mod.size, mod.name);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), mod.sha256, mod.name);
    assert.ok(Object.keys(load(full)).length > 0, `Empty native addon: ${mod.name}`);
  }
});
test('every packaged file matches signed-style SHA-256 content manifest', () => {
  for(const f of metadata.files) {
    const full=resolve(dist,f.path);
    assert.ok(full.startsWith(`${dist}/`) || full.startsWith(`${dist}\\`), f.path);
    // Hash and size-check the same bytes to prevent stat/read races.
    const content = readFileSync(full);
    assert.equal(content.length, f.bytes);
    assert.equal(createHash('sha256').update(content).digest('hex'),f.sha256,f.path);
  }
});
test('new distributable CLI is distinct from original binary', () => {
  const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
  assert.notEqual(hash(join(root,'cli.js')),hash(join(dist,'cli.js')));
});
test('installed launcher invokes newly built CLI', () => {
  const p=spawnSync(process.execPath,[join(dist,'launcher.cjs'),'--version'],{encoding:'utf8',timeout:15000});
  assert.equal(p.status,0,p.stderr);
  assert.equal(p.stdout.trim(), `${expectedVersion} (Claude Code)`);
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
      if (args[0] === '--version') assert.equal(p.stdout.trim(), `${expectedVersion} (Claude Code)`);
      else assert.match(p.stdout, /Usage:/);
    }
    const p = spawnSync(process.execPath, [join(installed, 'launcher.cjs'), '--version'], {
      cwd: sandbox, encoding: 'utf8', timeout: 25000,
    });
    assert.equal(p.status, 0, p.stderr);
    assert.equal(p.stdout.trim(), `${expectedVersion} (Claude Code)`);
  } finally {
    rmSync(sandbox, {recursive: true, force: true});
  }
});
