#!/usr/bin/env node
/**
 * Compare the current target release's CLI help and public options against
 * an official, independently checked Linux x64 executable. Inventory is a source-of-truth
 * report, not a formal feature sign-off.
 *
 * --strict enables enforcement once the CLI migration is completed.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCliHelp } from './m1-cli-help-options.mjs'

const required = flag => {
  const i = process.argv.indexOf(flag)
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Missing ${flag}`)
  return process.argv[i + 1]
}
const reference = required('--reference')
const candidate = required('--candidate')
const report = required('--report')
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const targetConfig = JSON.parse(readFileSync(join(root, 'docs/upgrade/m1-evidence/target-release.json'), 'utf8'))
const targetOption = process.argv.indexOf('--target')
const target = targetOption < 0 ? targetConfig.target_version : required('--target')
if (!/^\d+\.\d+\.\d+$/.test(target)) throw new Error(`Invalid expected target version: ${target}`)
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
  const { flags, usage } = parseCliHelp(output)
  return {
    status: result.error ? result.error.message : result.status,
    flags, usage,
    stderr: (result.stderr ?? '').slice(-300),
  }
}
const rows = []
// Explicitly approved product-surface change: the standalone ultrareview CLI
// was retired in favor of the unified /review extreme GitHub workflow.
const retiredCommands = new Set(['ultrareview'])
// User-approved local product scope: the upstream's official cloud control
// flags have no local equivalent. Both sides must match this exact inventory;
// newly missing options and unexpected additions still fail strict parity.
const retiredCloudFlags = ['--cloud', '--environment', '--remote-control', '--remote-control-session-name-prefix', '--teleport']
const intentionalLocalFlags = ['--proactive', '--strict-command']
function normalizeProductName(usage) {
  return usage.replace(/^Usage: yaoyaoche(?= |$)/, 'Usage: claude')
}
try {
  const release = spawnSync(reference, ['--version'], {
    cwd: home, env, encoding: 'utf8', timeout: 12000,
  })
  if (release.error || release.status !== 0 || !release.stdout.trim().startsWith(`${target} `)) {
    throw new Error(`Official reference does not match target ${target}: ${(release.stdout ?? release.stderr ?? release.error?.message ?? '').trim()}`)
  }
  const referenceVersion = release.stdout.trim()
  for (const command of commands) {
    const upstream = run(reference, command)
    const rebuilt = run(candidate, command)
    const missing = upstream.flags.filter(flag => !rebuilt.flags.includes(flag))
    const extra = rebuilt.flags.filter(flag => !upstream.flags.includes(flag))
    const normalizedCandidateUsage = normalizeProductName(rebuilt.usage)
    const commandHelp = `Usage: claude ${command}`
    const correctCommand = command === '' ? true : normalizedCandidateUsage.startsWith(commandHelp)
    const statusMatch = upstream.status === rebuilt.status
    const approvedRootScope = command === '' &&
      JSON.stringify(missing) === JSON.stringify(retiredCloudFlags) &&
      JSON.stringify(extra) === JSON.stringify(intentionalLocalFlags)
    const explicitlyRetired = retiredCommands.has(command) &&
      upstream.usage.startsWith(commandHelp) &&
      !normalizedCandidateUsage.startsWith(commandHelp) &&
      missing.length > 0
    const status = explicitlyRetired ? 'APPROVED_RETIRED'
      : !statusMatch ? 'EXIT_MISMATCH'
      : approvedRootScope ? 'APPROVED_LOCAL_ROOT_SCOPE'
      : !correctCommand ? 'WRONG_COMMAND_HELP'
      : missing.length > 0 || extra.length > 0 ? 'OPTIONS_MISMATCH'
      : upstream.usage !== normalizedCandidateUsage ? 'USAGE_TEXT_MISMATCH'
      : 'MATCH'
    rows.push({ command: command || '(root)', status,
      reference_status: upstream.status, candidate_status: rebuilt.status,
      official_usage: upstream.usage, candidate_usage: rebuilt.usage,
      missing_options: missing, extra_options: extra })
  }
  const counts = Object.fromEntries(
    [...new Set(rows.map(row => row.status))].map(s => [s, rows.filter(row => row.status === s).length]),
  )
  const approvedRetirements = rows.filter(row => row.status === 'APPROVED_RETIRED')
  if (approvedRetirements.length !== retiredCommands.size ||
      ![...retiredCommands].every(command => approvedRetirements.some(row => row.command === command))) {
    throw new Error('旧审查命令退役清单未按预期落实，必须人工核验命令是否复活或意外缺失')
  }
  const approvedRoot = rows.filter(row => row.status === 'APPROVED_LOCAL_ROOT_SCOPE')
  if (approvedRoot.length !== 1 || approvedRoot[0]?.command !== '(root)')
    throw new Error('本地化 CLI 预期移除及新增选项发生变化，必须逐项审计')
  const differences = rows.filter(row => !['MATCH', 'APPROVED_RETIRED', 'APPROVED_LOCAL_ROOT_SCOPE'].includes(row.status))
  const result = { target, reference_version: referenceVersion, baseline: 'SHA-verified official Linux x64',
    evidence_scope: 'CLI help and public options, not functional behavior',
    commands_checked: rows.length, differences: differences.length,
    approved_retirements: approvedRetirements.map(row => row.command),
    approved_root_cloud_flag_removals: retiredCloudFlags,
    approved_root_local_flag_additions: intentionalLocalFlags,
    counts, rows,
  }
  writeFileSync(report, `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify({ commands_checked: rows.length, differences: differences.length, counts,
    approved_retirements: approvedRetirements.map(row => row.command),
    notable: differences.filter(r => r.status === 'WRONG_COMMAND_HELP' || r.missing_options.length > 0).map(r => ({ command:r.command, status:r.status, missing:r.missing_options })) }))
  if (differences.length) console.log(`::warning::官方${target} CLI全量差异仍有待升级项目；见取证JSON，尚未正式签收。`)
  if (strict && differences.length) process.exitCode = 1
} finally {
  rmSync(home, { recursive: true, force: true })
}
