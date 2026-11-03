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
for (const args of [
  ['--help'], ['auth','--help'], ['auth','login','--help'], ['mcp','--help'],
  ['mcp','add','--help'], ['plugin','--help'], ['agents','--help'],
]) {
  test(`CLI options and commands parity: ${args.join(' ')}`, () => {
    const baseline = sections(originalHelp(args));
    const rebuilt = sections(compiledHelp(args));
    assert.ok(baseline.flags.length + baseline.commands.length > 0, 'Empty baseline command metadata');
    // 2.1.310 changes intentionally expand the top-level CLI. Keep the old
    // baseline as an exact guard for every unchanged command/option.
    if (args.length === 1 && args[0] === '--help') {
      const approvedAdded = new Set([
        '--bg', '--desktop', '--autocompact', '--permission-prompts', '--prompt-suggestions',
        '--restricted', '--safe-mode', '--ax-screen-reader', '--teleport', '--cloud', '--environment',
        '--remote-control', '--remote-control-session-name-prefix', '--system-prompt-snapshot', '--plugin-url', '--exclude-dynamic-system-prompt-sections', '--forward-subagent-text', '--permission-prompt-tool',
      ]);
      const added = rebuilt.flags.filter(flag => !baseline.flags.includes(flag));
      assert.deepEqual(added.filter(flag => !approvedAdded.has(flag)), [],
        'Unexpected extra CLI option beyond reviewed 2.1.310 migration');
      for(const required of ['--desktop','--bg','--autocompact','--restricted','--safe-mode','--permission-prompts','--prompt-suggestions','--teleport','--ax-screen-reader']){
        assert.ok(added.includes(required), `Expected reviewed 2.1.310 option missing: ${required}`);
      }
      // The target 2.1.310 x64 no longer exposes the old --mcp-debug
      // help switch. Preserve the other 2.1.88 options, with this precise
      // retirement supported by official --help evidence.
      const officiallyRetiredFlags = new Set(['--mcp-debug']);
      assert.deepEqual(
        baseline.flags.filter(flag => !rebuilt.flags.includes(flag) && !officiallyRetiredFlags.has(flag)),
        [],
        'Unreviewed old CLI options were removed unexpectedly',
      );
      assert.equal(rebuilt.flags.includes('--mcp-debug'), false,
        'Retired --mcp-debug unexpectedly returned to the public CLI help');
      // Official 2.1.310 ships a background-session fleet: these commands
      // did not exist in the 2.1.88 baseline, and must be checked against
      // the new binary, not rejected as unexplained additions.
      const targetCommands = new Set(['attach', 'logs', 'stop', 'respawn', 'rm', 'daemon', 'import']);
      const addedCommands = rebuilt.commands.filter(command => !baseline.commands.includes(command));
      assert.deepEqual(addedCommands.filter(command => !targetCommands.has(command)), [],
        'Unknown new CLI subcommand outside official 2.1.310');
      for (const required of targetCommands) {
        assert.ok(rebuilt.commands.includes(required), `Missing reviewed 2.1.310 public command: ${required}`);
      }
      assert.deepEqual(baseline.commands.filter(command => !rebuilt.commands.includes(command)), [],
        'Older public CLI command was lost unexpectedly');
      const help = compiledHelp(args);
      assert.match(help, /--fallback-model <model>/,
        'Ordered fallback model interface missing');
      assert.match(help, /--autocompact <auto\|tokens>/,
        'Auto-compact window interface missing');
    } else if (args[0] === 'agents') {
      assert.ok(rebuilt.flags.includes('--json'), 'Official background agents JSON mode is missing');
      assert.ok(rebuilt.flags.includes('--all'), 'Official background agents completion filter is missing');
      assert.ok(rebuilt.flags.includes('--cwd'), 'Official background agents cwd filter is missing');
      assert.ok(rebuilt.flags.includes('--setting-sources'), 'Existing settings source selector was lost');
    } else {
      assert.deepEqual(rebuilt, baseline, 'Unchanged CLI options or subcommands differ from 2.1.88 original');
    }
  });
}
test('legacy -d2e alias is accepted by reconstructed Commander configuration', () => {
  assert.match(compiledHelp(['-d2e','--help']), /Usage: claude/);
  assert.match(compiledHelp(['--debug-to-stderr','--help']), /Usage: claude/);
});
