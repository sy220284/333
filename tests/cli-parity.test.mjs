import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const targetVersion=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).version;
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
test('rebuilt CLI uses target version while original source is retained as old baseline', () => {
  assert.equal(compiledHelp(['--version']).trim(), `${targetVersion} (Claude Code)`);
  assert.equal(originalHelp(['--version']).trim(), '2.1.88 (Claude Code)');
});
// The 2.1.88 CLI is retained for historical compatibility checks only.
// Public commands and flags are matched to the byte-verified 2.1.317 native
// executable, captured in tests/fixtures/claude-2.1.317-official-cli-help.json.
const official317 = JSON.parse(
  readFileSync(resolve(root, 'tests/fixtures/claude-2.1.317-official-cli-help.json'), 'utf8'),
);
assert.equal(official317.version, targetVersion);

function nativeHelp(executable, args) {
  const output = spawnSync(executable, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 18000,
    env: {
      ...process.env,
      DISABLE_TELEMETRY: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    },
  });
  assert.equal(output.error, undefined, output.error?.message);
  assert.equal(output.status, 0, output.stderr);
  return output.stdout;
}

for (const [commandLine, expected] of Object.entries(official317.commands)) {
  test(`2.1.317 native CLI help parity: ${commandLine}`, () => {
    const args = commandLine.split(' ');
    if (process.platform === 'linux' && process.env.CLAUDE_TARGET_X64) {
      const native = sections(nativeHelp(process.env.CLAUDE_TARGET_X64, args));
      assert.deepEqual(native, expected, `The official x64 reference changed: ${commandLine}`);
    }
    const actual = sections(compiledHelp(args));
    assert.deepEqual(actual, expected, `2.1.317 CLI discrepancy: ${commandLine}`);
  });
}

test('legacy -d2e alias is accepted by reconstructed Commander configuration', () => {
  assert.match(compiledHelp(['-d2e','--help']), /Usage: claude/);
  assert.match(compiledHelp(['--debug-to-stderr','--help']), /Usage: claude/);
});

test('bootstrap route classification ignores literal prompt words after --', async () => {
  const { classifyStartupArgs } = await import('../src/entrypoints/startupRouting317.mjs');
  assert.equal(classifyStartupArgs(['-p', '--', 'agents', '--bg']).backgroundRequest, false);
  assert.equal(classifyStartupArgs(['--', '--tmux', '--worktree=demo']).tmuxWorktreeRequest, false);
  assert.equal(classifyStartupArgs(['agents', '--help']).backgroundRequest, true);
  assert.equal(classifyStartupArgs(['--bg', '-p', 'hello']).backgroundRequest, true);
  assert.equal(classifyStartupArgs(['--worktree=demo', '--tmux']).tmuxWorktreeRequest, true);
  assert.equal(classifyStartupArgs(['--tmux=classic', '-w']).tmuxWorktreeRequest, true);
});
