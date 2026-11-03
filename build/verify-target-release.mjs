import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const evidenceRoot = join(root, 'docs/upgrade/m1-evidence')
const versionParts = version => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  assert.ok(match, `Invalid release version: ${version}`)
  return match.slice(1).map(Number)
}
export function intermediateVersions(previous, target) {
  const [major, minor, start] = versionParts(previous)
  const [endMajor, endMinor, end] = versionParts(target)
  assert.equal(major, endMajor, 'Major version changed; establish a new baseline')
  assert.equal(minor, endMinor, 'Minor version changed; establish a new baseline')
  assert.ok(end > start, 'Target must be newer than the previous baseline')
  return Array.from({length: end-start}, (_, i) => `${major}.${minor}.${start+i+1}`)
}
const kinds = new Set(['Added', 'Fixed', 'Improved', 'Changed', 'Updated', 'Removed', 'Deprecated', 'Other'])

export function validateReleaseTarget(target, ledger, pathExists = existsSync) {
  const window = intermediateVersions(target.previous_target, target.target_version)
  assert.ok(Array.isArray(target.release_snapshots), 'Missing pinned official releases')
  assert.ok(Array.isArray(target.intermediate_versions_without_indexed_release_notes),
    'Intermediate versions without release notes must be explicit')
  const versions = target.release_snapshots.map(x => x.version)
  const skipped = target.intermediate_versions_without_indexed_release_notes
  const cmp = (a, b) => versionParts(a)[2] - versionParts(b)[2]
  assert.equal(new Set([...versions, ...skipped]).size, window.length,
    'Duplicate or missing intermediate release versions')
  assert.deepEqual([...versions, ...skipped].sort(cmp), window,
    'A patch version is missing from the upgrade window')
  assert.deepEqual(versions, [...versions].sort(cmp), 'Official releases are out of order')
  assert.equal(versions.at(-1), target.target_version)
  const expected = Object.fromEntries(target.release_snapshots.map(x => {
    assert.ok(Number.isSafeInteger(x.official_release_id) && x.official_release_id > 0,
      `Invalid official release id: ${x.version}`)
    assert.ok(Number.isFinite(Date.parse(x.published_at)), `Invalid release date: ${x.version}`)
    assert.ok(Number.isSafeInteger(x.entry_count) && x.entry_count > 0,
      `Invalid release item count: ${x.version}`)
    return [x.version, x.entry_count]
  }))
  assert.deepEqual(ledger.releases.map(({version, official_release_id, entry_count, published_at}) =>
    ({version, official_release_id, entry_count, published_at})),
    target.release_snapshots, 'Pinned official release snapshot has changed')
  assert.equal(ledger.target_version, target.target_version)
  assert.equal(ledger.previous_target, target.previous_target)
  const total = Object.values(expected).reduce((sum, count) => sum + count, 0)
  assert.equal(target.new_release_entries, total)
  assert.equal(target.cumulative_release_entries, target.prior_release_entries_to_verify + total)
  assert.equal(ledger.count, total)
  assert.equal(ledger.entries.length, total)
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
  assert.equal(seen.size, total)
  return { target: target.target_version, indexed: seen.size, byVersion: count,
    unindexedIntermediateVersions: skipped,
    sourceModified: ledger.entries.filter(row => row.changed_files?.length).length,
    verified: ledger.entries.filter(row => row.verification_status === '通过完整目标验收').length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = JSON.parse(readFileSync(join(evidenceRoot, 'target-release.json'), 'utf8'))
  const ledger = JSON.parse(readFileSync(join(root, target.release_ledger), 'utf8'))
  console.log(JSON.stringify(validateReleaseTarget(target, ledger), null, 2))
}
