#!/usr/bin/env node
/** The 2.1.310 Linux x64 release registers import but gates execution off. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function required(flag) {
  const index = process.argv.indexOf(flag)
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${flag}`)
  return process.argv[index + 1]
}
const reference = required('--reference')
const candidate = required('--candidate')
const report = required('--report')
const home = mkdtempSync(join(tmpdir(), 'claude-import-parity-'))
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  CLAUDE_CONFIG_DIR: join(home, '.claude'),
  XDG_CONFIG_HOME: join(home, '.config'),
  CI: '1',
  NO_COLOR: '1',
  DISABLE_AUTOUPDATER: '1',
  DISABLE_TELEMETRY: '1',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
}
for (const name of Object.keys(env)) {
  if (name.startsWith('ANTHROPIC_') || name === 'CLAUDE_CODE_FEATURE_FLAGS_OVERRIDE') delete env[name]
}
function run(binary, args) {
  const result = spawnSync(binary, args, {
    cwd: home, env, encoding: 'utf8', timeout: 10000,
    maxBuffer: 1024 * 1024,
  })
  if (result.error) throw result.error
  return {
    status: result.status,
    stdout: result.stdout.replaceAll('\r\n', '\n').trim(),
    stderr: result.stderr.replaceAll('\r\n', '\n').trim(),
  }
}
const cases = [
  { id: 'help', args: ['import', '--help'], help: true },
  { id: 'no-args', args: ['import'] },
  { id: 'dry-run', args: ['import', 'gemini', '--dry-run'] },
  { id: 'yes', args: ['import', 'cursor', '--yes'] },
  { id: 'unknown-source', args: ['import', 'unknown'] },
]
const rows = []
try {
  for (const item of cases) {
    const original = run(reference, item.args)
    const rebuilt = run(candidate, item.args)
    const expected = '`claude import` is not yet available in this build. Run `claude` and use /mcp or edit ~/.claude/settings.json directly.'
    const helpMatches = text => text.includes('Usage: claude import [options] [source]') &&
      text.includes('--dry-run') && text.includes('--yes')
    const passed = item.help
      ? original.status === 0 && rebuilt.status === 0 &&
        helpMatches(original.stdout) && helpMatches(rebuilt.stdout)
      : original.status === 1 && rebuilt.status === 1 &&
        original.stderr === expected && rebuilt.stderr === expected &&
        original.stdout === '' && rebuilt.stdout === ''
    rows.push({
      case: item.id,
      passed,
      reference_status: original.status,
      candidate_status: rebuilt.status,
      reference_error: item.help ? undefined : original.stderr,
      candidate_error: item.help ? undefined : rebuilt.stderr,
    })
  }
  const result = { version: '2.1.310', feature: 'import', rows, passed: rows.filter(r => r.passed).length, total: rows.length }
  writeFileSync(report, `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify({ passed: result.passed, total: result.total, failed: rows.filter(r => !r.passed).map(r => r.case) }))
  assert.equal(result.passed, result.total, 'Official import command surface or feature-gate behavior differs')
} finally {
  rmSync(home, { recursive: true, force: true })
}
