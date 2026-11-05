import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const candidate = resolve(import.meta.dirname, '../dist/cli.js')
const native = process.env.CLAUDE_TARGET_X64

function runCli(side, args, home) {
  const env = {
    ...process.env,
    HOME: home,
    CLAUDE_CONFIG_DIR: home,
    DISABLE_TELEMETRY: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  }
  const command = side === 'native' ? native : 'bun'
  const argv = side === 'native' ? args : [candidate, ...args]
  const result = spawnSync(command, argv, {
    encoding: 'utf8',
    timeout: 45_000,
    env,
    cwd: home,
  })
  assert.equal(result.error, undefined, side + ': ' + String(result.error))
  return result
}

function expectEnabled(home, pluginId, expected) {
  const settingsFile = join(home, 'settings.json')
  assert.ok(existsSync(settingsFile), 'settings.json must be created')
  const settings = JSON.parse(readFileSync(settingsFile, 'utf8'))
  assert.equal(settings.enabledPlugins?.[pluginId] === true, expected)
}

test('2.1.317 plugin install: a missing source cannot leave a falsely enabled plugin', () => {
  assert.ok(existsSync(candidate), 'run against the rebuilt CLI, not just a helper')
  const root = mkdtempSync(join(tmpdir(), 'pr7-plugin-transaction-'))
  try {
    const market = join(root, 'marketplace')
    const good = join(market, 'good')
    mkdirSync(join(market, '.claude-plugin'), { recursive: true })
    mkdirSync(join(good, '.claude-plugin'), { recursive: true })
    writeFileSync(join(market, '.claude-plugin', 'marketplace.json'), JSON.stringify({
      name: 'pr7-local-audit',
      owner: { name: 'Integration Test' },
      plugins: [
        { name: 'unavailable', source: './not-created', description: 'Broken source' },
        { name: 'good', source: './good', description: 'Valid source' },
      ],
    }))
    writeFileSync(join(good, '.claude-plugin', 'plugin.json'), JSON.stringify({
      name: 'good', description: 'Valid source',
    }))

    for (const side of native ? ['native', 'rebuilt'] : ['rebuilt']) {
      const home = join(root, side)
      mkdirSync(home, { recursive: true })
      const added = runCli(side, ['plugin', 'marketplace', 'add', market, '--json'], home)
      assert.equal(added.status, 0, side + ' marketplace add: ' + added.stderr)

      const broken = runCli(side, ['plugin', 'install', 'unavailable@pr7-local-audit', '--json'], home)
      assert.notEqual(broken.status, 0, side + ' must refuse the missing source')
      expectEnabled(home, 'unavailable@pr7-local-audit', false)

      const valid = runCli(side, ['plugin', 'install', 'good@pr7-local-audit', '--json'], home)
      assert.equal(valid.status, 0, side + ' valid install: ' + valid.stderr + valid.stdout)
      expectEnabled(home, 'good@pr7-local-audit', true)
      expectEnabled(home, 'unavailable@pr7-local-audit', false)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
