#!/usr/bin/env node
// Exercise every test omitted from explicitly scheduled npm and CI suites.
// File discovery is automatic, so newly added tests cannot be stranded.
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
export function discoverUnregisteredTests(root = ROOT) {
  const tests = walk(join(root, 'tests'))
    .map(abs => relative(root, abs).split(sep).join('/'))
    .filter(path => /\.test\.(mjs|ts)$/.test(path)).sort()
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const commands = Object.values(manifest.scripts ?? {}).join('\n')
  const workflows = walk(join(root, '.github', 'workflows'))
    .filter(path => /\.ya?ml$/.test(path))
    .map(path => readFileSync(path, 'utf8')).join('\n')
  const registered = tests.filter(path => commands.includes(path) || workflows.includes(path))
  const pending = tests.filter(path => !commands.includes(path) && !workflows.includes(path))
  if (pending.length + registered.length !== tests.length) throw Error('Test inventory inconsistent')
  return { tests, registered, pending }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { tests, registered, pending } = discoverUnregisteredTests()
  console.log(JSON.stringify({ total: tests.length, explicitlyScheduled: registered.length,
    discoveredForExecution: pending.length, tests: pending }, null, 2))
  if (!process.argv.includes('--list')) {
    for (const ext of ['.mjs', '.ts']) {
      const found = pending.filter(path => path.endsWith(ext))
      if (!found.length) continue
      const program = ext === '.mjs' ? process.execPath : 'bun'
      const options = ext === '.mjs' ? ['--test', '--test-concurrency=4'] : ['test']
      const outcome = spawnSync(program, [...options, ...found], {
        cwd: ROOT, stdio: 'inherit', timeout: 15 * 60_000,
      })
      if (outcome.error) throw outcome.error
      if (outcome.status !== 0) process.exit(outcome.status ?? 1)
    }
  }
}
