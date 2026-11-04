import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import './m1-native-run-skills-317.test.mjs'
import { intermediateVersions, validateReleaseTarget } from '../build/verify-target-release.mjs'
const read = name => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'))
test('完整新版计划使用M1–M6且102功能84场景独立保持未签收', () => {
  const target = read('docs/upgrade/m1-evidence/target-release.json')
  const coverage = read('docs/upgrade/upgrade-coverage.json')
  const baseline = read('docs/upgrade/2.1.317-功能与场景源数据.json')
  const implementation = read('docs/upgrade/2.1.317-六层完整功能链路.json')
  assert.equal(target.target_version, '2.1.317')
  assert.equal(target.previous_target, '2.1.310')
  assert.equal(coverage.target_version, target.target_version)
  assert.equal(baseline.target_version, target.target_version)
  assert.equal(implementation.target_version, target.target_version)
  assert.deepEqual(coverage.tasks.map(task => task.id), ['M1','M2','M3','M4','M5','M6'])
  assert.equal(coverage.chains.length, 20)
  assert.equal(coverage.features.length, 102)
  assert.equal(coverage.scenarios.length, 84)
  assert.deepEqual(new Set(coverage.features.map(item => item.id)).size, 102)
  assert.deepEqual(new Set(coverage.scenarios.map(item => item.id)).size, 84)
  assert.deepEqual(new Set(baseline.features.map(item => item.id)).size, 102)
  assert.deepEqual(new Set(baseline.scenarios.map(item => item.id)).size, 84)
  assert.ok(coverage.features.every(item => item.status === 'UNVERIFIED'))
  assert.equal(implementation.independent_update_tracking.scope, 'SEPARATE')
  assert.ok(target.verified_x64_sha256 === null ||
    /^[a-f0-9]{64}$/.test(target.verified_x64_sha256))
})
test('392 historical release-note rows remain traceable without constraining target sign-off', () => {
  const target = read('docs/upgrade/m1-evidence/target-release.json')
  const ledger = read('docs/upgrade/m1-evidence/2.1.311-2.1.317-官方逐条变更与验收台账.json')
  assert.equal(ledger.target_version, target.target_version)
  assert.equal(ledger.count, target.new_release_entries)
  assert.equal(ledger.entries.length, target.new_release_entries)
  assert.equal(new Set(ledger.entries.map(x => x.id)).size, ledger.count)
  assert.equal(ledger.releases.reduce((n, r) => n + r.entry_count, 0), ledger.count)
  assert.equal(validateReleaseTarget(target, ledger).indexed, ledger.count)
  assert.deepEqual(intermediateVersions(target.previous_target, target.target_version),
    ['2.1.311','2.1.312','2.1.313','2.1.314','2.1.315','2.1.316','2.1.317'])
  for (const row of ledger.entries) {
    assert.ok(row.version && row.source_url && row.official_text)
    if (row.verification_status === '通过完整目标验收') {
      assert.ok(row.runtime_evidence && row.build_evidence,
        `${row.id}: final acceptance requires original and candidate runtime evidence`)
    }
  }
})

test('中间发行版缺口或官方快照被篡改时拒绝验收', () => {
  const target = read('docs/upgrade/m1-evidence/target-release.json')
  const ledger = read(target.release_ledger)
  const incomplete = structuredClone(target)
  incomplete.intermediate_versions_without_indexed_release_notes = []
  assert.throws(() => validateReleaseTarget(incomplete, ledger), /missing intermediate release|patch version is missing|Duplicate or missing intermediate/)
  const corrupted = structuredClone(ledger)
  corrupted.releases[0].entry_count += 1
  assert.throws(() => validateReleaseTarget(target, corrupted), /Pinned official release snapshot/)
})
