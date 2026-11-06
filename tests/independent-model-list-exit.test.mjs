import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist')
const bundledCli = join(dist, 'cli.js')
const standalone = join(dist, process.platform === 'win32' ? 'claude.exe' : 'claude')

function runOnce(args) {
  const home = mkdtempSync(join(tmpdir(), '333-model-list-exit-'))
  const native = process.env.M1_NATIVE_BINARY_RUN === '1'
  try {
    const child = spawnSync(native ? standalone : 'bun',
      [...(native ? [] : [bundledCli]), 'models', 'list', ...args], {
        cwd: root, encoding: 'utf8', timeout: 12_000,
        env: {
          ...process.env,
          HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: home,
          DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
          CI: 'true', NO_COLOR: '1',
        },
      })
    assert.ifError(child.error)
    assert.equal(child.signal, null, 'models list did not exit normally: ' + JSON.stringify(child))
    assert.equal(child.status, 0, 'models list failed: ' + JSON.stringify(child))
    return child.stdout
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

test('models list is a one-shot read without persistent Git/file watchers', () => {
  assert.equal(existsSync(bundledCli), true, 'Build dist/cli.js before the CLI lifecycle regression')
  const output = runOnce([])
  assert.ok(output.trim().length > 0, 'No built-in models displayed')
  assert.equal(output.includes('[STARTUP]'), false)
})

test('models list --json returns its model inventory and exits on all hosts', () => {
  assert.equal(existsSync(bundledCli), true, 'Build dist/cli.js before the CLI lifecycle regression')
  const inventory = JSON.parse(runOnce(['--json']))
  assert.ok(Array.isArray(inventory))
  assert.ok(inventory.length > 0)
  assert.ok(inventory.every(item => typeof item.id === 'string' && typeof item.provider === 'string'))
})
