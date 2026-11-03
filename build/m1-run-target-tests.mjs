#!/usr/bin/env node
// Automatically exercise source-implemented release changes instead of
// maintaining a separate hardcoded test list for every target version.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET_FILE = 'docs/upgrade/m1-evidence/target-release.json'
const TEST_FILE = /^tests\/[A-Za-z0-9_.\/-]+\.test\.(?:mjs|ts)$/

export function collectImplementedReleaseTests(ledger, exists = path => existsSync(resolve(ROOT, path))) {
  assert.ok(Array.isArray(ledger.entries), 'Target release ledger must contain individual entries')
  const modified = ledger.entries.filter(x => x.implementation_status !== '待源码及运行对照')
  const suites = new Set()
  for (const entry of modified) {
    const changed = entry.changed_files ?? []
    assert.ok(Array.isArray(changed) && changed.length, `${entry.id}: implemented change has no changed files`)
    const direct = changed.filter(x => typeof x === 'string' && TEST_FILE.test(x) && !x.includes('..'))
    // Multiple release notes can share one source change and one test suite.
    // Verify the relationship through a shared source path, not a name guess.
    const peer = modified.flatMap(other => {
      if (other.id === entry.id) return []
      const shared = changed.some(path => path.startsWith('src/') && other.changed_files?.includes(path))
      return shared
        ? (other.changed_files ?? []).filter(x => typeof x === 'string' && TEST_FILE.test(x) && !x.includes('..'))
        : []
    })
    const evidence = [...direct, ...peer]
    assert.ok(evidence.length, `${entry.id}: source marked implemented without any related executable test`)
    for (const file of evidence) {
      assert.ok(exists(file), `${entry.id}: missing executable test ${file}`)
      suites.add(file)
    }
  }
  assert.ok(suites.size > 0, 'No implemented release features have executable tests')
  return [...suites].sort()
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = JSON.parse(readFileSync(resolve(ROOT, TARGET_FILE), 'utf8'))
  const ledger = JSON.parse(readFileSync(resolve(ROOT, target.release_ledger), 'utf8'))
  const tests = collectImplementedReleaseTests(ledger)
  console.log(JSON.stringify({target: ledger.target_version, suites: tests}, null, 2))
  if (!process.argv.includes('--check')) {
    for (const [extension, command, prefix] of [
      ['.mjs', process.execPath, ['--test']],
      ['.ts', 'bun', ['test']],
    ]) {
      const selected = tests.filter(path => path.endsWith(extension))
      if (!selected.length) continue
      const run = spawnSync(command, [...prefix, ...selected], {cwd: ROOT, stdio: 'inherit'})
      if (run.error) throw run.error
      if (run.status !== 0) process.exit(run.status ?? 1)
    }
  }
}
