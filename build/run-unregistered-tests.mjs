#!/usr/bin/env node
// Cover both unregistered tests and tests only scheduled in branch-specific CI.
// The workflow-only mode prevents PR13 from treating PR7-only jobs as proof.
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return []
    const abs = join(dir, entry.name)
    return entry.isDirectory() ? walk(abs) : entry.isFile() ? [abs] : []
  })
}
export function discoverUnregisteredTests(root = ROOT, options = {}) {
  const tests = walk(join(root, 'tests'))
    .map(abs => relative(root, abs).split(sep).join('/'))
    .filter(path => /\.test\.(mjs|ts)$/.test(path)).sort()
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const commands = Object.values(manifest.scripts ?? {}).join('\n')
  const workflows = walk(join(root, '.github', 'workflows'))
    .filter(path => /\.ya?ml$/.test(path))
    .map(path => readFileSync(path, 'utf8')).join('\n')
  const workflowOnly = options.workflowOnly === true
  const registered = tests.filter(path => workflowOnly
    ? commands.includes(path) || !workflows.includes(path)
    : commands.includes(path) || workflows.includes(path))
  const pending = tests.filter(path => !commands.includes(path) &&
    (workflowOnly ? workflows.includes(path) : !workflows.includes(path)))
  if (pending.length + registered.length !== tests.length) throw Error('Test inventory inconsistent')
  return { tests, registered, pending }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const workflowOnly = process.argv.includes('--workflow-only')
  const { tests, registered, pending } = discoverUnregisteredTests(ROOT, { workflowOnly })
  console.log(JSON.stringify({ mode: workflowOnly ? 'workflow-only' : 'unregistered',
    total: tests.length, explicitlyScheduled: registered.length,
    discoveredForExecution: pending.length, tests: pending }, null, 2))
  if (!process.argv.includes('--list')) {
    const failures = []
    for (const ext of ['.mjs', '.ts']) {
      const found = pending.filter(path => path.endsWith(ext))
      if (!found.length) continue
      const program = ext === '.mjs' ? process.execPath : 'bun'
      const options = ext === '.mjs' ? ['--test', '--test-concurrency=4'] : ['test']
      // Branch-specific suites often mutate global mocks or CLI fixtures.
      // Run each workflow-only test file in its own process for isolation.
      const groups = workflowOnly ? found.map(path => [path]) : [found]
      for (const group of groups) {
        const outcome = spawnSync(program, [...options, ...group], {
          cwd: ROOT, stdio: 'inherit', timeout: 15 * 60_000,
        })
        if (outcome.error || outcome.status !== 0) {
          const cause = outcome.error?.message ?? `exit status ${outcome.status ?? 'unknown'}`
          failures.push({ tests: group, cause })
          // The regular test:all path keeps its existing fail-fast behavior.
          // In workflow-only mode, audit every previously unexecuted suite
          // and report all failures in a single CI run.
          if (!workflowOnly) {
            console.error(JSON.stringify({ failedTests: failures }, null, 2))
            process.exitCode = 1
            break
          }
        }
      }
      if (failures.length && !workflowOnly) break
    }
    if (failures.length) {
      console.error(JSON.stringify({ failedTests: failures, count: failures.length }, null, 2))
      process.exitCode = 1
    }
  }
}
