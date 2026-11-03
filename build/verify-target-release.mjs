import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const evidenceRoot = join(root, 'docs/upgrade/m1-evidence')
const expected = { '2.1.311': 92, '2.1.312': 39, '2.1.314': 119, '2.1.316': 55, '2.1.317': 87 }
const kinds = new Set(['Added', 'Fixed', 'Improved', 'Changed', 'Updated', 'Removed', 'Deprecated', 'Other'])

export function validateReleaseTarget(target, ledger, pathExists = existsSync) {
  assert.equal(target.target_version, '2.1.317')
  assert.equal(target.previous_target, '2.1.310')
  assert.equal(ledger.target_version, target.target_version)
  assert.equal(ledger.previous_target, target.previous_target)
  assert.equal(target.new_release_entries, 392)
  assert.equal(target.total_entries_from_2_1_310_to_2_1_317, 418)
  assert.equal(ledger.count, 392)
  assert.equal(ledger.entries.length, 392)
  assert.deepEqual(Object.fromEntries(ledger.releases.map(x => [x.version, x.entry_count])), expected)
  const seen = new Set()
  const count = Object.fromEntries(Object.keys(expected).map(key => [key, 0]))
  for (const row of ledger.entries) {
    assert.ok(row.official_text.trim(), `missing official text: ${row.id}`)
    assert.ok(kinds.has(row.verb), `unknown change category: ${row.id}`)
    assert.ok(expected[row.version], `unexpected version: ${row.id}`)
    assert.equal(row.source_url, `https://github.com/anthropics/claude-code/releases/tag/v${row.version}`)
    assert.equal(row.id, `${row.version}#${String(row.ordinal).padStart(3, '0')}`)
    assert.ok(!seen.has(row.id), `duplicate record: ${row.id}`)
    seen.add(row.id)
    count[row.version] += 1
    assert.ok(row.implementation_status && row.verification_status)
    if (row.implementation_status.includes('源码已修改')) {
      assert.ok(row.changed_files.length > 0, `missing code evidence: ${row.id}`)
      for (const path of row.changed_files) {
        assert.ok(pathExists(join(root, path)), `missing referenced source: ${row.id} ${path}`)
      }
    }
    if (row.verification_status === '通过完整目标验收') {
      assert.ok(row.runtime_evidence && row.build_evidence,
        `no runtime and build evidence for acceptance: ${row.id}`)
    }
  }
  assert.deepEqual(count, expected)
  assert.equal(seen.size, 392)
  return { target: target.target_version, indexed: seen.size, byVersion: count,
    sourceModified: ledger.entries.filter(row => row.changed_files?.length).length,
    verified: ledger.entries.filter(row => row.verification_status === '通过完整目标验收').length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = JSON.parse(readFileSync(join(evidenceRoot, 'target-release.json'), 'utf8'))
  const ledger = JSON.parse(readFileSync(join(evidenceRoot, '2.1.311-2.1.317-官方逐条变更与验收台账.json'), 'utf8'))
  console.log(JSON.stringify(validateReleaseTarget(target, ledger), null, 2))
}
