#!/usr/bin/env node
/**
 * Test inventory and execution contract for both main and workflow-only suites.
 *
 * Tests are runnable artifacts with runtime, fixtures and platform requirements;
 * the filename suffix alone cannot select their runtime. Nothing is silently
 * skipped: missing prerequisites and failures fail the aggregate CI result.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW_ONLY = process.argv.includes('--workflow-only')
const CI_SUPPLEMENTAL = process.argv.includes('--ci-supplemental')
const CI_ORACLE = process.argv.includes('--ci-oracle')
const EXCLUDE_ORACLE = process.argv.includes('--exclude-oracle')

// Official native parity is executed once with a verified 2.1.317 binary,
// rather than silently skipped on each of the six supplemental shards.
export const ORACLE_TESTS = Object.freeze([
  "tests/m1-coldstart-official-native-317.test.mjs",
  "tests/m3-plugin-command-source-native-317.test.mjs",
  "tests/m3-plugin-config-native-parity-317.test.mjs",
  "tests/m3-plugin-details-native-parity-317.test.mjs",
  "tests/m3-plugin-init-native-parity-317.test.mjs",
  "tests/m3-plugin-tag-native-parity-317.test.mjs",
  "tests/m4-plugin-prune-native-parity-317.test.mjs",
  "tests/m1-317-json-wire-e2e.test.mjs",
  "tests/m1-background-agent-parity.test.mjs",
  "tests/m1-obsolete-command-parity.test.mjs",
  "tests/m3-plugin-install-transaction-317.test.mjs",
  "tests/m1-background-lifecycle.test.mjs",
  "tests/fallback-529-integration.test.mjs",
  "tests/upgrade-mode-integration.test.mjs"
])
const ORACLE_SET = new Set(ORACLE_TESTS)

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return []
    const abs = join(dir, entry.name)
    return entry.isDirectory() ? walk(abs) : entry.isFile() ? [abs] : []
  })
}

/** Extract only executable YAML run commands, excluding filters and labels. */
export function workflowRunCommands(source) {
  const lines = source.split(/\r?\n/)
  const commands = []
  for (let i = 0; i < lines.length; i++) {
    const match = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(lines[i])
    if (!match || match[1].length < 6) continue
    const indent = match[1].length
    const inline = match[2].trim()
    if (inline && !['|','>','|-','>-','|+','>+'].includes(inline)) {
      commands.push(inline)
      continue
    }
    while (i + 1 < lines.length) {
      const row = lines[i + 1]
      if (row.trim() && row.length - row.trimStart().length <= indent) break
      commands.push(row)
      i++
    }
  }
  return commands.join('\n')
}

export function discoverUnregisteredTests(root = ROOT, options = {}) {
  const tests = walk(join(root, 'tests'))
    .map(abs => relative(root, abs).split(sep).join('/'))
    .filter(path => /\.test\.(mjs|ts)$/.test(path)).sort()
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const commands = Object.values(manifest.scripts ?? {}).join('\n')
  // An entry in paths: or a retired workflow does not execute a test.
  const workflows = walk(join(root, '.github', 'workflows'))
    .filter(path => /\.ya?ml$/.test(path))
    .map(path => readFileSync(path, 'utf8'))
    .filter(source => /^ {2}(?:pull_request|workflow_call):\s*$/m.test(source))
    .map(workflowRunCommands).join('\n')
  const workflowOnly = options.workflowOnly === true
  const supplemental = options.ciSupplemental === true
  const oracleOnly = options.ciOracle === true
  const excludeOracle = options.excludeOracle === true
  const pending = tests.filter(path =>
    oracleOnly ? ORACLE_SET.has(path)
      : !commands.includes(path) &&
        (supplemental || (workflowOnly ? workflows.includes(path) : !workflows.includes(path))) &&
        !(excludeOracle && ORACLE_SET.has(path)))
  // Registered means excluded from this execution mode. Keep the sets disjoint
  // for normal, workflow-only, and supplemental runs alike.
  const selected = new Set(pending)
  const registered = tests.filter(path => !selected.has(path))
  if (pending.length + registered.length !== tests.length) throw Error('Test inventory inconsistent')
  return { tests, registered, pending }
}

function checked(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT, stdio: 'inherit', timeout: 15 * 60_000, ...options,
  })
  if (result.error || result.status !== 0) {
    throw new Error(program + ' ' + args.join(' ') +
      ': ' + (result.error?.message ?? 'exit status ' + (result.status ?? 'unknown')))
  }
}

export function runtimeForTest(file, source = readFileSync(resolve(ROOT, file), 'utf8')) {
  // This node:test suite embeds TypeScript imports in a subprocess script
  // string; run it under Node to avoid Bun's 5s implicit test timeout.
  if (file === 'tests/m1-runner-declares-317.test.mjs' ||
      file === 'tests/github-integration-flow.test.mjs') return 'node'
  if (file.endsWith('.ts') || /\b(?:from|import)\s*(?:\(|.*?\sfrom\s*)?['"]bun(?::|['"])/.test(source) ||
      /\bBun\.(?:serve|spawn|file|SQL|env|sleep)\b/.test(source) ||
      /(?:from|import)\s*(?:\(|.*?\sfrom\s*)?['"][^'"]+\.ts['"]/.test(source)) {
    return 'bun'
  }
  return 'node'
}

/** Every fixture is created before the corresponding test and always cleaned up. */
function runTest(file, runtime, options = {}) {
  const env = { ...process.env }
  let args = runtime === 'bun' ? ['test', file] : ['--test', file]
  let program = runtime === 'bun' ? 'bun' : process.execPath
  let disposable = null
  try {
    if (file === 'tests/governance-contract-trace.test.mjs') {
      // TypeScript 7 checks production source; the separately pinned TS5.9
      // JavaScript parser is required for AST-based governance analysis.
      const parser = process.env.TS_COMPILER_PATH
      if (!parser || !existsSync(parser)) {
        throw new Error('Governance AST parser missing: install pinned TypeScript 5.9.3 and set TS_COMPILER_PATH')
      }
      mkdirSync(resolve(ROOT, '.rebuild/governance'), { recursive: true })
      const dir = resolve(ROOT, '.rebuild/governance')
      const log = join(dir, 'typescript.log')
      const typecheck = spawnSync(process.execPath, ['tools/dev/dev.mjs', 'typecheck:all'], {
        cwd: ROOT, encoding: 'utf8', timeout: 15 * 60_000,
      })
      if (typecheck.error) throw typecheck.error
      writeFileSync(log, (typecheck.stdout ?? '') + (typecheck.stderr ?? ''))
      checked(process.execPath, ['tools/governance/summarize.mjs', 'types',
        log, join(dir, 'type-report.json')])
      checked(process.execPath, ['tools/governance/missing-sources.mjs',
        join(dir, 'type-report.json'), join(dir, 'missing-sources.json')])
      checked(process.execPath, ['tools/governance/contract-trace.mjs',
        join(dir, 'missing-sources.json'), join(dir, 'missing-contracts.json')])
      args = [file, join(dir, 'missing-contracts.json')]
    }
    if (file === 'tests/m1-source-gap-ast.test.mjs') {
      env.M1_TYPESCRIPT_MODULE = process.env.M1_TYPESCRIPT_MODULE ??
        process.env.TS_COMPILER_PATH
      if (!env.M1_TYPESCRIPT_MODULE || !existsSync(env.M1_TYPESCRIPT_MODULE)) {
        throw new Error('Pinned TypeScript parser must be installed and passed as TS_COMPILER_PATH')
      }
    }
    if (file === 'tests/m1-ink-paste-event.test.mjs') {
      const parser = process.env.TS_COMPILER_PATH
      const compiler = parser ? join(dirname(parser), 'tsc.js') : undefined
      if (!compiler || !existsSync(compiler)) {
        throw new Error('Ink event compilation requires tsc.js beside the pinned TypeScript parser')
      }
      disposable = mkdtempSync(join(tmpdir(), '333-ink-event-test-'))
      const ambient = join(disposable, 'bun-ambient.d.ts')
      writeFileSync(ambient, 'declare const Bun: { stripANSI(input: string): string }\n')
      checked(process.execPath, [
        compiler, '--strict', '--skipLibCheck', '--target', 'ES2023',
        '--module', 'CommonJS', '--moduleResolution', 'Node', '--rootDir', 'src/ink/events',
        '--outDir', join(disposable, 'events'), 'src/ink/events/paste-event.ts', ambient,
      ])
      env.M1_INK_EVENTS_DIR = disposable
    }
    if (file === 'tests/m1-six-host-native-audio-317.test.mjs') {
      env.M1_TARGET_PLATFORM = process.platform + '-' + process.arch
    }
    if (file === 'tests/m1-native-clipboard-xvfb-317.test.mjs' &&
        process.platform === 'linux' && process.arch === 'x64') {
      program = 'xvfb-run'
      args = ['-a', process.execPath, '--test', file]
    }
    console.log(JSON.stringify({ suite: file, runtime, program, args, host: process.platform + '-' + process.arch }))
    checked(program, args, { env, ...options })
  } finally {
    if (disposable) rmSync(disposable, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { tests, registered, pending } = discoverUnregisteredTests(ROOT, {
    workflowOnly: WORKFLOW_ONLY, ciSupplemental: CI_SUPPLEMENTAL,
    ciOracle: CI_ORACLE, excludeOracle: EXCLUDE_ORACLE,
  })
  if (CI_ORACLE) {
    const missing = ORACLE_TESTS.filter(path => !tests.includes(path))
    if (missing.length) throw new Error(`Official parity test missing from repository: ${missing.join(', ')}`)
    if (!process.argv.includes('--list')) {
      for (const key of ['CLAUDE_TARGET_X64', 'CLAUDE_REFERENCE_BIN']) {
        if (!process.env[key] || !existsSync(process.env[key]))
          throw new Error(`Official parity cannot run without verified ${key}`)
      }
    }
  }
  const value = flag => {
    const item = process.argv.find(arg => arg.startsWith(`${flag}=`))
    return item ? Number(item.slice(flag.length + 1)) : null
  }
  const shardCount = value('--shard-count') ?? 1
  const shardIndex = value('--shard-index') ?? 0
  if (!Number.isSafeInteger(shardCount) || shardCount < 1 ||
    !Number.isSafeInteger(shardIndex) || shardIndex < 0 || shardIndex >= shardCount)
    throw new Error('无效测试分片范围')
  const selected = pending.filter((_, i) => i % shardCount === shardIndex)
  const plan = selected.map(file => ({ file, runtime: runtimeForTest(file) }))
  console.log(JSON.stringify({
    mode: CI_ORACLE ? 'ci-oracle' : CI_SUPPLEMENTAL ? 'ci-supplemental' : (WORKFLOW_ONLY ? 'workflow-only' : 'unregistered'),
    total: tests.length, explicitlyScheduled: registered.length,
    candidateCount: pending.length, shardIndex, shardCount,
    discoveredForExecution: plan.length, planned: plan,
  }, null, 2))
  if (!process.argv.includes('--list')) {
    const failures = []
    let executed = 0
    for (const { file, runtime } of plan) {
      executed++
      try {
        runTest(file, runtime)
      } catch (error) {
        failures.push({ test: file, runtime, cause: String(error) })
        console.error(JSON.stringify({ failedTest: file, runtime, cause: String(error) }))
        if (process.argv.includes('--fail-fast')) break
      }
    }
    console.log(JSON.stringify({ executed, failed: failures.length, failures }, null, 2))
    if (failures.length) process.exitCode = 1
  }
}
