import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
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
    assert.match(r.stdout, /^Usage: claude plugin test \[dir\]/)
    assert.match(r.stdout, /imports its kit from 'claude-code\/testing'/)
    assert.doesNotMatch(r.stdout, /Usage: claude \[options\]/)
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
    assert.doesNotMatch(r.stdout, /Usage: claude \[options\]/)
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
    assert.doesNotMatch(r.stdout, /Usage: claude \[options\]/)
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})
