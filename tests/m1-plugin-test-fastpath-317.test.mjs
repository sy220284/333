import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const cli = resolve(import.meta.dirname, '../dist/cli.js')
function execute(args, configDir) {
  const result = spawnSync('bun', [cli, 'plugin', 'test', ...args], {
    encoding: 'utf8',
    timeout: 15000,
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: configDir,
      DISABLE_TELEMETRY: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    },
  })
  assert.ifError(result.error)
  return result
}

test('317 plugin test help has a standalone route before the interactive CLI', () => {
  const root = mkdtempSync(join(tmpdir(), '333-test-help-'))
  try {
    const r = execute(['--help'], root)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /^Usage: avenlo plugin test \[dir\]/)
    assert.match(r.stdout, /imports its kit from 'claude-code\/testing'/)
    assert.doesNotMatch(r.stdout, /Usage: avenlo \[options\]/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('317 plugin test dedicated worker rejects a file outside its plugin root', () => {
  const parent = mkdtempSync(join(tmpdir(), '333-test-isolation-'))
  try {
    const root = join(parent, 'plugin')
    mkdirSync(root)
    const outside = join(parent, 'outside.test.ts')
    writeFileSync(outside, '', 'utf8')
    const r = execute(['--file', outside, root], parent)
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(r.stderr, /plugin test worker file must be inside the plugin directory/)
    assert.doesNotMatch(r.stdout, /Usage: avenlo \[options\]/)
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})

test('317 plugin test folder runs the test handler and reports its real failure', () => {
  const parent = mkdtempSync(join(tmpdir(), '333-test-folder-'))
  try {
    const root = join(parent, 'plugin')
    mkdirSync(root)
    const r = execute([root], parent)
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(r.stderr, /no hooks\/hooks\.json naming one in "modules"/)
    assert.doesNotMatch(r.stdout, /Usage: avenlo \[options\]/)
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})

test('317 plugin worker emits the official report marker and parseable result', () => {
  const parent = mkdtempSync(join(tmpdir(), '333-plugin-wire-'))
  try {
    const plugin = join(parent, 'plugin')
    mkdirSync(join(plugin, '.claude-plugin'), { recursive: true })
    mkdirSync(join(plugin, 'hooks'), { recursive: true })
    writeFileSync(join(plugin, '.claude-plugin', 'plugin.json'), '{"name":"wire-test"}\n')
    writeFileSync(join(plugin, 'hooks', 'hooks.json'), '{"modules":["./register.js"]}\n')
    writeFileSync(join(plugin, 'hooks', 'register.js'), 'export function register(on) {}\n')
    const file = join(plugin, 'wire.test.ts')
    writeFileSync(file, "import { test, expect } from 'claude-code/testing'\ntest('wire result', () => { expect(1).toBe(1) })\n")
    const r = execute(['--file', file, plugin], parent)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    const line = r.stdout.trim().split('\n').findLast(row =>
      row.startsWith('claude-plugin-test-report '))
    assert.ok(line, r.stdout + r.stderr)
    const payload = JSON.parse(line.slice('claude-plugin-test-report '.length))
    // The worker may canonicalize /var into /private/var on macOS and
    // Windows may preserve a DOS 8.3 short name in the fixture path.
    // Compare filesystem identity rather than platform-dependent spelling.
    const actual = statSync(payload.file, { bigint: true })
    const expected = statSync(file, { bigint: true })
    assert.equal(actual.dev, expected.dev)
    assert.equal(actual.ino, expected.ino)
    assert.equal(actual.size, expected.size)
    assert.equal(readFileSync(payload.file, 'utf8'), readFileSync(file, 'utf8'))
    assert.ok(Array.isArray(payload.results))
    assert.ok(payload.results.some(item => item.title.includes('wire result') &&
      item.failure == null), JSON.stringify(payload))
    assert.doesNotMatch(r.stdout, /@@CLAUDE_PLUGIN_TEST_RESULT_317@@/)
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})

test('official 317 plugin-test policy rejects disabled hooks before help or test execution', () => {
  const parent = mkdtempSync(join(tmpdir(), '333-plugin-policy-'))
  try {
    const config = join(parent, 'config')
    const plugin = join(parent, 'plugin')
    mkdirSync(config)
    mkdirSync(plugin)
    writeFileSync(join(config, 'settings.json'), '{"disableAllHooks":true}\n')
    const blocked = execute([plugin], config)
    assert.equal(blocked.status, 1, blocked.stdout + blocked.stderr)
    assert.equal(blocked.stderr.trim(),
      'claude plugin test: hooks modules are turned off here (disableAllHooks, allowManagedHooksOnly or a policy)')
    assert.doesNotMatch(blocked.stderr, /no hooks\/hooks\.json/)
    const help = execute(['--help'], config)
    assert.equal(help.status, 1, help.stdout + help.stderr)
    assert.equal(help.stdout, '')
    assert.equal(help.stderr.trim(), blocked.stderr.trim())
    const invalid = execute(['--bad'], config)
    assert.equal(invalid.status, 1, invalid.stdout + invalid.stderr)
    assert.equal(invalid.stderr.trim(), blocked.stderr.trim())
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})

test('official 317 --file worker reports disabled hooks as JSON with exit code zero', () => {
  const parent = mkdtempSync(join(tmpdir(), '333-plugin-worker-policy-'))
  try {
    const config = join(parent, 'config')
    mkdirSync(config)
    writeFileSync(join(config, 'settings.json'), '{"disableAllHooks":true}\n')
    const file = join(parent, 'not-run.test.ts')
    const result = execute(['--file', file, parent], config)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stderr, '')
    const report = result.stdout.trim()
    assert.ok(report.startsWith('claude-plugin-test-report '), report)
    const value = JSON.parse(report.slice('claude-plugin-test-report '.length))
    assert.equal(value.file, file)
    assert.deepEqual(value.results, [])
    assert.equal(value.error,
      'hooks modules are turned off here (disableAllHooks, allowManagedHooksOnly or a policy)')
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})
