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
      const match = line.match(/^ {2}(?:-[a-z0-9],\s*)?(--[a-z][a-z0-9-]*)/i);
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
  assert.equal(compiledHelp(['--version']).trim(), `${targetVersion} (333)`);
  assert.equal(originalHelp(['--version']).trim(), '2.1.88 (Claude Code)');
});
// The 2.1.88 CLI is retained for historical compatibility checks only.
// Public commands and flags are matched to the byte-verified 2.1.317 native
// executable, captured in tests/fixtures/claude-2.1.317-official-cli-help.json.
const official317 = JSON.parse(
  readFileSync(resolve(root, 'tests/fixtures/claude-2.1.317-official-cli-help.json'), 'utf8'),
);
assert.equal(official317.version, targetVersion);

// 333's additive interfaces are explicitly documented here. The official
// 2.1.317 command and flag contract is still compared exhaustively; only
// these intentional additions may differ from the Claude reference.
const independentCommands = {
  '--help': ['local-settings', 'local-tasks', 'models'],
  'auth --help': ['api-key', 'chatgpt-login', 'chatgpt-logout', 'chatgpt-status'],
};
function verifyBaseAndExtensions(actual, official, commandLine) {
  const additions = independentCommands[commandLine] ?? [];
  for (const entry of additions) {
    assert.ok(actual.commands.includes(entry), `333 independent command absent: ${entry}`);
    assert.equal(actual.commands.filter(name => name === entry).length, 1);
  }
  assert.deepEqual(actual.flags, official.flags,
    `Original 2.1.317 flags must stay available: ${commandLine}`);
  assert.deepEqual(actual.commands.filter(name => !additions.includes(name)), official.commands,
    `2.1.317 original commands changed: ${commandLine}`);
}

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
    verifyBaseAndExtensions(actual, expected, commandLine);
  });
}

test('317 hidden permission callback reaches the existing permission consumer', () => {
  const help = compiledHelp(['--help']);
  assert.equal(sections(help).flags.includes('--permission-prompt-tool'), false,
    'the official 317 SDK-only callback remains hidden from public --help');
  assert.match(help, /--permission-prompts\s+<target>/);
  const main = readFileSync(resolve(root, 'src/main.tsx'), 'utf8');
  const print = readFileSync(resolve(root, 'src/cli/print.ts'), 'utf8');
  assert.match(main, /permissionPromptToolName:\s*options\.permissionPromptTool/);
  assert.match(print, /getCanUseToolFn\(/);
  assert.match(print, /toolMatchesName\(t, permissionPromptToolName\)/);
});

test('legacy -d2e alias is accepted by reconstructed Commander configuration', () => {
  assert.match(compiledHelp(['-d2e','--help']), /Usage: 333/);
  assert.match(compiledHelp(['--debug-to-stderr','--help']), /Usage: 333/);
});

test('bootstrap route classification ignores literal prompt words after --', async () => {
  const { classifyStartupArgs } = await import('../src/entrypoints/startupRouting317.mjs');
  assert.equal(classifyStartupArgs(['-p', '--', 'agents', '--bg']).backgroundRequest, false);
  assert.equal(classifyStartupArgs(['--', '--tmux', '--worktree=demo']).tmuxWorktreeRequest, false);
  assert.equal(classifyStartupArgs(['agents', '--help']).backgroundRequest, true);
  assert.equal(classifyStartupArgs(['--bg', '-p', 'hello']).backgroundRequest, true);
  assert.equal(classifyStartupArgs(['--prefill', '--bg']).backgroundRequest, false);
  assert.equal(classifyStartupArgs(['--settings', '--tmux', '--worktree=demo']).tmuxWorktreeRequest, false);
  assert.equal(classifyStartupArgs(['--worktree=demo', '--tmux']).tmuxWorktreeRequest, true);
  assert.equal(classifyStartupArgs(['--tmux=classic', '-w']).tmuxWorktreeRequest, true);
});

test('2.1.317 hidden permission callback flag is accepted and reaches the SDK route', () => {
  const help = compiledHelp(['--permission-prompt-tool', 'mcp__permission', '--help'])
  assert.match(help, /Usage: 333/)
  assert.equal(sections(help).flags.includes('--permission-prompt-tool'), false,
    'the upstream hides this SDK-only flag from public help')
  if (process.platform === 'linux' && process.env.CLAUDE_TARGET_X64) {
    const native = nativeHelp(process.env.CLAUDE_TARGET_X64,
      ['--permission-prompt-tool', 'mcp__permission', '--help'])
    assert.deepEqual(sections(help), sections(native))
  }
  const main = readFileSync(resolve(root, 'src/main.tsx'), 'utf8')
  assert.match(main, /permissionPromptToolName: options\.permissionPromptTool/,
    'accepted option was not forwarded to real permission execution')
  assert.equal((main.match(/new Option\('--permission-prompt-tool <tool>'/g) || []).length, 1,
    'SDK callback option must be registered exactly once')
})
