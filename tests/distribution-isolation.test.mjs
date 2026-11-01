import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('../', import.meta.url).pathname;
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
  const isolation = mkdtempSync(join(tmpdir(),'333-standalone-'));
  const packageDir = join(isolation,'release');
  try {
    cpSync(releaseDir, packageDir, {recursive:true});
    assert.equal(existsSync(join(packageDir,'src')),false);
    assert.equal(existsSync(join(packageDir,'.rebuild')),false);
    const source = readFileSync(join(root,'cli.js'));
    const output = readFileSync(join(packageDir,'cli.js'));
    assert.notEqual(createHash('sha256').update(source).digest('hex'),createHash('sha256').update(output).digest('hex'));
    const version=invoke('bun',[join(packageDir,'cli.js'),'--version'],isolation);
    assert.match(version,/2\\.1\\.88 \\(Claude Code\\)/);
    const help=invoke(process.execPath,[join(packageDir,'launcher.cjs'),'--help'],isolation);
    assert.match(help,/--print/);
    const plugin=invoke('bun',[join(packageDir,'cli.js'),'plugin','--help'],isolation);
    assert.match(plugin,/marketplace/);
  } finally {
    rmSync(isolation,{recursive:true,force:true});
  }
});
