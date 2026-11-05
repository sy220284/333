import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { removeAutoModeSection } from '../src/cli/handlers/autoModeCliPolicy.mjs'

test('317 reset is restricted to autoMode and preserves unknown user keys', () => {
  const source = { model: 'opus', unknown: { valuable: true }, autoMode: { allow: ['one'] } }
  assert.deepEqual(removeAutoModeSection(source), { model: 'opus', unknown: { valuable: true } })
  assert.deepEqual(source.autoMode.allow, ['one'])
  assert.equal(removeAutoModeSection({ model: 'opus' }), null)
})
test('317 real CLI reset requires confirmation and preserves other settings', () => {
  const home = mkdtempSync(join(tmpdir(), 'pr7-am-reset-'))
  try {
    const file = join(home, 'settings.json')
    writeFileSync(file, JSON.stringify({ model: 'sonnet', autoMode: { allow: ['custom'] } }))
    const run = args => spawnSync('bun', [resolve(import.meta.dirname,'../dist/cli.js'), 'auto-mode', ...args], {
      cwd: resolve(import.meta.dirname, '..'),
      env: { ...process.env, CLAUDE_CONFIG_DIR: home, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1' },
      encoding: 'utf8', timeout: 16000,
    })
    const blocked = run(['reset'])
    assert.equal(blocked.status, 1, blocked.stderr)
    assert.ok(JSON.parse(readFileSync(file, 'utf8')).autoMode)
    const allowed = run(['reset', '--yes'])
    assert.equal(allowed.status, 0, allowed.stderr)
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { model: 'sonnet' })
    assert.match(allowed.stdout, /reset to defaults/)
    assert.equal(run(['reset', '--yes']).status, 0)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
