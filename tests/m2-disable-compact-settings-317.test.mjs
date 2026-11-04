import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterSettingsCompactionEnv } from '../src/utils/managedCompactionEnv.mjs'

test('2.1.317: settings may only disable compaction', () => {
  for (const value of ['1', 'true', 'TrUe ', 'yes', 'on', ' ON ']) {
    assert.equal(filterSettingsCompactionEnv({ DISABLE_COMPACT: value }).DISABLE_COMPACT, value)
  }
  for (const value of ['0', 'false', 'NO', 'off', '', 'unexpected']) {
    assert.equal('DISABLE_COMPACT' in filterSettingsCompactionEnv({ DISABLE_COMPACT: value }), false)
  }
})

test('2.1.317: project or mod false values cannot undo a protected true value', () => {
  const applied = { DISABLE_COMPACT: '1' }
  Object.assign(applied, filterSettingsCompactionEnv({ DISABLE_COMPACT: '0' }))
  assert.equal(applied.DISABLE_COMPACT, '1')
  Object.assign(applied, filterSettingsCompactionEnv({ DISABLE_COMPACT: 'true' }))
  assert.equal(applied.DISABLE_COMPACT, 'true')
})

test('other settings env keys and names remain intact', () => {
  const source = { ANTHROPIC_MODEL: 'some-model', DISABLE_COMPACT: '0', NO_COLOR: '1' }
  assert.deepEqual(filterSettingsCompactionEnv(source), {
    ANTHROPIC_MODEL: 'some-model',
    NO_COLOR: '1',
  })
  assert.deepEqual(source, { ANTHROPIC_MODEL: 'some-model', DISABLE_COMPACT: '0', NO_COLOR: '1' })
  assert.deepEqual(filterSettingsCompactionEnv(undefined), {})
})
