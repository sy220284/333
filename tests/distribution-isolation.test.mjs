import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseDir = join(root, 'dist');

function invoke(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd, encoding:'utf8', timeout:20000,
    env:{...process.env, DISABLE_TELEMETRY:'1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'}
  });
  assert.equal(result.error,undefined,result.error?.message);
  assert.equal(result.status,0,JSON.stringify({args,stderr:result.stderr,stdout:result.stdout.slice(0,800)}));
  return result.stdout;
}
test('distributable starts outside repository with no source tree, original CLI, or dependency cache', () => {
  const isolation = mkdtempSync(join(tmpdir(),'yaoyaoche-standalone-'));
  const packageDir = join(isolation,'release');
  try {
    cpSync(releaseDir, packageDir, {recursive:true});
    assert.equal(existsSync(join(packageDir,'src')),false);
    assert.equal(existsSync(join(packageDir,'.rebuild')),false);
    const source = readFileSync(join(root,'cli.js'));
    const output = readFileSync(join(packageDir,'cli.js'));
    assert.notEqual(createHash('sha256').update(source).digest('hex'),createHash('sha256').update(output).digest('hex'));
    const version=invoke('bun',[join(packageDir,'cli.js'),'--version'],isolation);
    const expectedVersion = JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
    assert.equal(version.trim(),`${expectedVersion} (摇摇车)`);
    const help=invoke(process.execPath,[join(packageDir,'launcher.cjs'),'--help'],isolation);
    assert.match(help,/--print/);
    const plugin=invoke('bun',[join(packageDir,'cli.js'),'plugin','--help'],isolation);
    assert.match(plugin,/marketplace/);
  } finally {
    rmSync(isolation,{recursive:true,force:true});
  }
});

test('desktop SDK host is shipped independently and handles protocol handshake outside the source tree', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'yaoyaoche-desktop-release-'));
  try {
    const release = join(sandbox, 'release');
    cpSync(releaseDir, release, { recursive: true });
    const native = process.platform === 'win32' ? 'yaoyaoche-desktop.exe' : 'yaoyaoche-desktop';
    const response = spawnSync(join(release, native), [], {
      cwd: sandbox, encoding: 'utf8', timeout: 30_000,
      input: '{"id":"isolated-hello","method":"hello"}\n',
      env: { ...process.env, PATH: '', Path: '' }, windowsHide: true,
    });
    assert.equal(response.error, undefined, String(response.error));
    assert.equal(response.status, 0, response.stderr);
    const frames = response.stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(frames.find(frame => frame.id === 'isolated-hello')?.result?.protocolVersion, 1);
  } finally { rmSync(sandbox, { recursive: true, force: true }); }
});
