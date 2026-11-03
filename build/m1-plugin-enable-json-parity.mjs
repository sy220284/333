#!/usr/bin/env node
/** Real offline plugin enable --json mutation and result parity with 2.1.310. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function get(flag) {
  const i = process.argv.indexOf(flag)
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Missing ${flag}`)
  return process.argv[i + 1]
}
const reference = get('--reference')
const candidate = get('--candidate')
const report = get('--report')
const samples = [
  { id: 'full-id-user', argv: ['foo@bar'], scope: 'user', success: true },
  { id: 'explicit-project', argv: ['foo@bar', '--scope', 'project'], scope: 'project', success: true },
  { id: 'missing-marketplace', argv: ['foo'], success: false },
]
const rows = []
function run(executable, item) {
  const root = mkdtempSync(join(tmpdir(), 'plugin-enable-json-'))
  try {
    const config = join(root, '.claude')
    mkdirSync(config, { recursive: true })
    const env = {
      ...process.env, HOME: root, USERPROFILE: root, CLAUDE_CONFIG_DIR: config,
      XDG_CONFIG_HOME: join(root, '.config'), CI: '1', NO_COLOR: '1',
      DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    }
    for (const key of Object.keys(env)) {
      if (key.startsWith('ANTHROPIC_')) delete env[key]
    }
    const result = spawnSync(executable, ['plugin', 'enable', '--json', ...item.argv], {
      cwd: root, env, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024,
    })
    if (result.error) throw result.error
    const data = JSON.parse(result.stdout.trim())
    const path = join(config, 'settings.json')
    let enabled
    try { enabled = JSON.parse(readFileSync(path, 'utf8')).enabledPlugins?.['foo@bar'] } catch { enabled = undefined }
    return { status: result.status, data, enabled, stderr: result.stderr.trim() }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
for (const item of samples) {
  const official = run(reference, item)
  const rebuilt = run(candidate, item)
  const passed = official.status === rebuilt.status &&
    JSON.stringify(official.data) === JSON.stringify(rebuilt.data) &&
    official.enabled === rebuilt.enabled &&
    official.status === (item.success ? 0 : 1) &&
    (item.success ? official.enabled === true : official.enabled === undefined)
  rows.push({ id: item.id, passed, official: {
    status: official.status, data: official.data, enabled: official.enabled,
  }, rebuilt: { status: rebuilt.status, data: rebuilt.data, enabled: rebuilt.enabled } })
}
const result = { version: '2.1.310', feature: 'plugin enable --json', rows, passed: rows.filter(r => r.passed).length, total: rows.length }
writeFileSync(report, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify({ passed: result.passed, total: result.total, failed: rows.filter(r => !r.passed).map(r => r.id) }))
assert.equal(result.passed, result.total, 'Plugin enable --json differs from official output or persistence')
