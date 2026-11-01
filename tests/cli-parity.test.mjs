import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const original = resolve(root, 'cli.js');
const compiled = resolve(root, 'dist/cli.js');

function run(exe, file, args) {
  const result = spawnSync(exe, [file, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 18000,
    maxBuffer: 3 * 1024 * 1024,
    env: {
      ...process.env,
      DISABLE_TELEMETRY: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    },
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, [exe,file,args.join(' '),result.stderr].join('\n'));
  return result.stdout;
}
function originalHelp(args) { return run(process.execPath, original, args); }
function compiledHelp(args) { return run('bun', compiled, args); }
function sections(output) {
  const lines = output.split(/\r?\n/);
  const flags = [];
  const commands = [];
  let section = '';
  for (const line of lines) {
    if (/^(Options|Commands):\s*$/.test(line)) {
      section = line.split(':')[0];
      continue;
    }
    if (/^\S/.test(line) && line.trim() && !/^(Usage|Arguments):/.test(line)) section = '';
    if (section === 'Options') {
      const match = line.match(/^\s+(?:-[a-z0-9],\s*)?(--[a-z][a-z0-9-]*)/i);
      if (match) flags.push(match[1]);
    }
    if (section === 'Commands') {
      const match = line.match(/^ {2}([a-z][a-z0-9_-]*)(?:\s|\||$)/i);
      if (match) commands.push(match[1]);
    }
  }
  return {flags:[...new Set(flags)].sort(),commands:[...new Set(commands)].sort()};
}
test('identical product version from original and rebuilt source', () => {
  assert.equal(compiledHelp(['--version']), originalHelp(['--version']));
  assert.match(compiledHelp(['--version']), /2\.1\.88 \(Claude Code\)/);
});
for (const args of [
  ['--help'], ['auth','--help'], ['auth','login','--help'], ['mcp','--help'],
  ['mcp','add','--help'], ['plugin','--help'], ['agents','--help'],
]) {
  test('CLI options and commands parity: ' + args.join(' '), () => {
    const baseline = sections(originalHelp(args));
    const rebuilt = sections(compiledHelp(args));
    assert.ok(baseline.flags.length + baseline.commands.length > 0, 'Empty baseline command metadata');
    assert.deepEqual(rebuilt, baseline, 'CLI public options and subcommands differ from 2.1.88 original');
  });
}
test('legacy -d2e alias is accepted by reconstructed Commander configuration', () => {
  assert.match(compiledHelp(['-d2e','--help']), /Usage: claude/);
  assert.match(compiledHelp(['--debug-to-stderr','--help']), /Usage: claude/);
});
