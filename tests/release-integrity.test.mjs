import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

const root=resolve(import.meta.dirname,'..'),dist=join(root,'dist');
const expectedVersion=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
const metadata=JSON.parse(readFileSync(join(dist,'integrity.json'),'utf8'));
test('release package preserves all 13 platform files alongside 317 decompiled resources', () => {
  assert.equal(metadata.version, expectedVersion);
  // The 13 platform binaries remain mandatory. The 317 migration also
  // packages thousands of decompiled original resources under vendor/claude-code-*,
  // so checking every vendor file against a fixed count rejects a complete build.
  const platformVendorPaths = [
    ...['arm64-darwin','arm64-linux','arm64-win32','x64-darwin','x64-linux','x64-win32']
      .map(platform=>`vendor/audio-capture/${platform}/audio-capture.node`),
    'vendor/ripgrep/COPYING',
    ...['arm64-darwin','arm64-linux','arm64-win32','x64-darwin','x64-linux','x64-win32']
      .map(platform=>`vendor/ripgrep/${platform}/${platform.endsWith('win32') ? 'rg.exe' : 'rg'}`),
  ];
  const shipped = new Set(metadata.files.map(f=>f.path));
  assert.equal(platformVendorPaths.length,13);
  for (const path of platformVendorPaths) assert.ok(shipped.has(path), `Missing platform asset: ${path}`);
  const platformVendorRecords = metadata.files.filter(f=>
    f.path.startsWith('vendor/') && !f.path.startsWith('vendor/claude-code-2.1.317/'));
  assert.equal(platformVendorRecords.length,13);
  assert.ok(existsSync(join(dist,'cli.js')));
  assert.ok(existsSync(join(dist,'launcher.cjs')));
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

test('Linux x64 release defaults to the SHA-pinned complete official 317 native runtime', () => {
  if (process.platform !== 'linux' || process.arch !== 'x64') return;
  const manifest = JSON.parse(readFileSync(join(dist, 'vendor/claude-code-2.1.317/manifest.json'), 'utf8'));
  assert.equal(manifest.version, expectedVersion);
  assert.equal(manifest.module_count, 2924);
  const native = join(dist, 'vendor/claude-code-2.1.317/native/linux-x64/claude');
  assert.ok(existsSync(native), 'The original runtime must be staged at release packaging time');
  const sha = createHash('sha256').update(readFileSync(native)).digest('hex');
  assert.equal(sha, manifest.binary_sha256, 'The shipped runtime must match its exact decompiled ELF');
  const env = {...process.env, DISABLE_TELEMETRY:'1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'};
  const version = spawnSync(process.execPath,[join(dist,'launcher.cjs'),'--version'],{encoding:'utf8',timeout:15000,env});
  assert.equal(version.status,0,version.stderr);
  assert.equal(version.stdout.trim(), `${expectedVersion} (Claude Code)`);
  const official = spawnSync(native,['--help'],{encoding:'utf8',timeout:45000,maxBuffer:3*1024*1024,env});
  assert.equal(official.status,0,official.stderr?.slice(-1500));
  const auto = spawnSync(process.execPath,[join(dist,'launcher.cjs'),'--help'],
    {encoding:'utf8',timeout:45000,maxBuffer:3*1024*1024,env});
  assert.equal(auto.status,0,auto.stderr?.slice(-1500));
  assert.equal(auto.stdout,official.stdout,'The user-facing CLI must run the official native 317 engine');
  assert.match(auto.stdout,/gateway/);
  assert.match(auto.stdout,/ultrareview/);
  const dir=mkdtempSync(join(tmpdir(),'333-official-native-prune-'));
  try {
    const task=spawnSync(process.execPath,[join(dist,'launcher.cjs'),'plugin','prune','--yes'],{
      encoding:'utf8',timeout:20000,env:{...env,CLAUDE_CONFIG_DIR:dir}
    });
    assert.equal(task.status,0,task.stderr?.slice(-1500));
    assert.match(task.stdout,/Nothing to prune/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
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
