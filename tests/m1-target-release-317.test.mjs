import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { validateReleaseTarget } from '../build/verify-target-release.mjs'

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const target = readJson('../docs/upgrade/m1-evidence/target-release.json')
const ledger = readJson('../docs/upgrade/m1-evidence/2.1.311-2.1.317-官方逐条变更与验收台账.json')

test('2.1.317: official 392 changes have unique IDs, source links and owner status', () => {
  assert.deepEqual(validateReleaseTarget(target, ledger, existsSync).byVersion, {
    '2.1.311': 92, '2.1.312': 39, '2.1.314': 119, '2.1.316': 55, '2.1.317': 87,
  })
})

test('release ledger cannot silently omit a version entry', () => {
  const partial = { ...ledger, entries: ledger.entries.slice(1), count: 391 }
  assert.throws(() => validateReleaseTarget(target, partial), /392/)
})

test('unverified work cannot be silently marked accepted', () => {
  const changed = { ...ledger, entries: [...ledger.entries] }
  changed.entries[0] = { ...changed.entries[0], verification_status: '通过完整目标验收' }
  assert.throws(() => validateReleaseTarget(target, changed), /no runtime and build evidence/)
})

test('source changes need a real matching file path in the repository', () => {
  const changed = { ...ledger, entries: [...ledger.entries] }
  changed.entries[0] = { ...changed.entries[0], implementation_status: '源码已修改，待构建与实测', changed_files: ['src/不存在.ts'] }
  assert.throws(() => validateReleaseTarget(target, changed), /missing referenced source/)
})
