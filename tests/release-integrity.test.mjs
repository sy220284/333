import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, cpSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import './m1-vendor-packaging-317.test.mjs';
import './m1-native-clipboard-317.test.mjs';
import './m1-native-clipboard-bundle-317.test.mjs';
import './m1-clipboard-osc-protocol-317.test.mjs';
import './m1-launcher-lifecycle-317.test.mjs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

const root=resolve(import.meta.dirname,'..'),dist=join(root,'dist');
const expectedVersion=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
const hostVendorDir = process.arch + '-' + process.platform;
const knownVendorDirs = new Set([
  'x64-linux', 'arm64-linux', 'x64-darwin', 'arm64-darwin',
  'x64-win32', 'arm64-win32',
]);
function isCurrentPlatformResource(name) {
  const segments = name.split('/');
  return segments.length < 3 ||
    !knownVendorDirs.has(segments[2]) || segments[2] === hostVendorDir;
}

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
  const sourceFiles = vendorFiles(join(root, 'vendor')).filter(isCurrentPlatformResource);
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
test('platform package uses only the SHA-256 pinned official 2.1.317 native audio for this architecture', () => {
  const official = JSON.parse(readFileSync(join(root, 'build/official-native-audio-317.json'), 'utf8'));
  const platform = process.platform + '-' + process.arch;
  const pinned = official.modules[platform];
  assert.ok(pinned, 'No pinned native audio manifest for ' + platform);
  const name = 'vendor/audio-capture/' + hostVendorDir + '/audio-capture.node';
  const binary = join(dist, name);
  assert.equal(existsSync(binary), true, name);
  const bytes = readFileSync(binary);
  assert.equal(bytes.length, pinned.audio_size);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pinned.audio_sha256);
  const entry = metadata.files.find(item => item.path === name);
  assert.ok(entry, 'Native audio missing from integrity manifest');
  assert.equal(entry.sha256, pinned.audio_sha256);
  const module = createRequire(import.meta.url)(binary);
  for (const method of ['startRecording', 'stopRecording', 'isRecording',
    'startPlayback', 'writePlaybackData', 'stopPlayback', 'isPlaying']) {
    assert.equal(typeof module[method], 'function', method);
  }
  for (const f of metadata.files.filter(item => item.path.startsWith('vendor/'))) {
    assert.ok(isCurrentPlatformResource(f.path), 'Foreign-platform binary leaked into release: ' + f.path);
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
test("repository package uses rebuilt launcher canonical entrypoint", () => {
  const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const releasePackage = JSON.parse(readFileSync(join(dist, 'package.json'), 'utf8'));
  assert.equal(rootPackage.bin.yaoyaoche, 'dist/launcher.cjs');
  assert.equal(releasePackage.bin.yaoyaoche, './launcher.cjs');
  assert.ok(existsSync(join(root, rootPackage.bin.yaoyaoche)));
});

test('new distributable CLI is distinct from original binary', () => {
  const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
  assert.notEqual(hash(join(root,'cli.js')),hash(join(dist,'cli.js')));
});
test('compiled platform executable is packaged, signed and runs without system Bun', () => {
  const name = process.platform === 'win32' ? 'yaoyaoche.exe' : 'yaoyaoche';
  const binary = join(dist, name);
  assert.ok(existsSync(binary), name + ' missing from release');
  const bytes = readFileSync(binary);
  assert.ok(statSync(binary).isFile() && bytes.length > 10_000_000, 'Incomplete embedded Bun executable');
  const record = metadata.files.find(f => f.path === name);
  assert.ok(record, 'Native executable missing from SHA-256 release manifest');
  assert.equal(record.bytes, bytes.length);
  assert.equal(record.sha256, createHash('sha256').update(bytes).digest('hex'));
  const sandbox = mkdtempSync(join(tmpdir(), 'yaoyaoche-native-launch-'));
  try {
    const env = { ...process.env, PATH: '', Path: '' };
    for (const [entrypoint, args] of [
      [binary, ['--version']],
      [process.execPath, [join(dist, 'launcher.cjs'), '--version']],
    ]) {
      const actual = spawnSync(entrypoint, args, {
        cwd: sandbox, env, encoding: 'utf8', timeout: 30_000, windowsHide: true,
      });
      assert.equal(actual.error, undefined, String(actual.error));
      assert.equal(actual.status, 0, actual.stderr);
      assert.equal(actual.stdout.trim(), `${expectedVersion} (摇摇车)`);
    }
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
test('installed launcher invokes newly built CLI', () => {
  const p=spawnSync(process.execPath,[join(dist,'launcher.cjs'),'--version'],{encoding:'utf8',timeout:15000});
  assert.equal(p.status,0,p.stderr);
  assert.equal(p.stdout.trim(), `${expectedVersion} (摇摇车)`);
});

test('release is runnable from an isolated folder without repository node_modules', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'yaoyaoche-distributable-'));
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
      if (args[0] === '--version') assert.equal(p.stdout.trim(), `${expectedVersion} (摇摇车)`);
      else assert.match(p.stdout, /Usage:/);
    }
    const p = spawnSync(process.execPath, [join(installed, 'launcher.cjs'), '--version'], {
      cwd: sandbox, encoding: 'utf8', timeout: 25000,
    });
    assert.equal(p.status, 0, p.stderr);
    assert.equal(p.stdout.trim(), `${expectedVersion} (摇摇车)`);
  } finally {
    // On Windows ARM64, the native launcher can exit before Windows releases
    // its just-executed .exe file handle. Node's built-in recursive removal
    // retries only the known transient OS errors (including EPERM/EBUSY).
    // Exhausted retries still throw, so orphaned releases fail the test.
    rmSync(sandbox, {
      recursive: true, force: true,
      maxRetries: process.platform === 'win32' ? 20 : 0,
      retryDelay: 150,
    });
    assert.equal(existsSync(sandbox), false, 'isolated release directory was not removed');
  }
});
