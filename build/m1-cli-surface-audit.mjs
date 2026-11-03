#!/usr/bin/env node
/**
 * Discover every public 2.1.310 CLI help/option divergence against the
 * installed, SHA-pinned Linux x64 release. Inventory is a source-of-truth
 * report, not a formal feature sign-off.
 *
 * --strict enables enforcement once the CLI migration is completed.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const required = flag => {
  const i = process.argv.indexOf(flag)
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Missing ${flag}`)
  return process.argv[i + 1]
}
const reference = required('--reference')
const candidate = required('--candidate')
const report = required('--report')
const strict = process.argv.includes('--strict')
const commands = [
  '', 'agents', 'attach', 'auth', 'auth login', 'auth logout', 'auth status',
  'auto-mode', 'doctor', 'gateway', 'import', 'install', 'logs',
  'mcp', 'mcp add', 'mcp get', 'mcp list', 'mcp remove',
  'plugin', 'plugin install', 'plugin list', 'plugin enable',
  'plugin marketplace', 'plugin marketplace add', 'plugin marketplace list',
  'purge', 'respawn', 'rm', 'setup-token', 'stop', 'ultrareview', 'update',
]
const home = mkdtempSync(join(tmpdir(), 'm1-cli-help-surface-'))
const env = {
  ...process.env,
  HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: join(home, '.claude'),
  XDG_CONFIG_HOME: join(home, '.config'), CI: '1',
  NO_COLOR: '1', DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
}
for (const key of Object.keys(env)) {
  if (key.startsWith('ANTHROPIC_')) delete env[key]
}
function run(executable, command) {
  const result = spawnSync(executable, [...command.split(' ').filter(Boolean), '--help'], {
    cwd: home, env, encoding: 'utf8', timeout: 12000, maxBuffer: 2 * 1024 * 1024,
  })
  const output = (result.stdout ?? '').replaceAll('\r\n', '\n')
  const flags = [...new Set([...output.matchAll(/^\s+(?:-[a-z0-9],\s*)?(--[a-z][a-z0-9-]*)/gim)]
    .map(match => match[1]))].sort()
  const usage = output.split('\n').find(line => line.startsWith('Usage:'))?.trim() ?? ''
  return {
    status: result.error ? result.error.message : result.status,
    flags, usage,
    stderr: (result.stderr ?? '').slice(-300),
  }
}
const rows = []
try {
  for (const command of commands) {
    const upstream = run(reference, command)
    const rebuilt = run(candidate, command)
    const missing = upstream.flags.filter(flag => !rebuilt.flags.includes(flag))
    const extra = rebuilt.flags.filter(flag => !upstream.flags.includes(flag))
    const correctCommand = command === '' ? true : rebuilt.usage.startsWith(`Usage: claude ${command}`)
    const statusMatch = upstream.status === rebuilt.status
    const status = !statusMatch ? 'EXIT_MISMATCH'
      : !correctCommand ? 'WRONG_COMMAND_HELP'
      : missing.length > 0 || extra.length > 0 ? 'OPTIONS_MISMATCH'
      : upstream.usage !== rebuilt.usage ? 'USAGE_TEXT_MISMATCH'
      : 'MATCH'
    rows.push({ command: command || '(root)', status,
      reference_status: upstream.status, candidate_status: rebuilt.status,
      official_usage: upstream.usage, candidate_usage: rebuilt.usage,
      missing_options: missing, extra_options: extra })
  }
  const counts = Object.fromEntries(
    [...new Set(rows.map(row => row.status))].map(s => [s, rows.filter(row => row.status === s).length]),
  )
  const differences = rows.filter(row => row.status !== 'MATCH')
  const result = { target: '2.1.310', baseline: 'pinned official Linux x64',
    evidence_scope: 'CLI help and public options, not functional behavior',
    commands_checked: rows.length, differences: differences.length,
    counts, rows,
  }
  writeFileSync(report, `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify({ commands_checked: rows.length, differences: differences.length, counts,
    notable: differences.filter(r => r.status === 'WRONG_COMMAND_HELP' || r.missing_options.length > 0).map(r => ({ command:r.command, status:r.status, missing:r.missing_options })) }))
  if (differences.length) console.log('::warning::官方2.1.310 CLI全量差异仍有待升级项目；见取证JSON，尚未正式签收。')
  if (strict && differences.length) process.exitCode = 1
} finally {
  rmSync(home, { recursive: true, force: true })
}
