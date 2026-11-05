import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPluginTestKit317 } from '../src/cli/handlers/pluginTestKit317.mjs'

test('317 testing kit: nested describes, timeoutMs and default timeouts match native', () => {
  const kit = createPluginTestKit317()
  kit.namespace.describe('outer', () => {
    kit.namespace.describe('inner', () => {
      kit.namespace.test('explicit', { timeoutMs: 42, plugins: [] }, () => {})
    })
  })
  kit.namespace.test('default', () => {})
  assert.deepEqual(kit.cases.map(c => c.title), ['outer > inner > explicit', 'default'])
  assert.deepEqual(kit.cases.map(c => c.options.timeoutMs), [42, 5000])
})

test('317 testing kit: rejects malformed plugin lists and timeoutMs', () => {
  for (const options of [
    { plugins: 'wrong' }, { timeoutMs: 0 }, { timeoutMs: -1 },
    { timeoutMs: NaN }, { timeoutMs: Infinity }, { timeoutMs: '5' },
    { options: [] },
  ]) {
    const kit = createPluginTestKit317()
    assert.throws(() => kit.namespace.test('invalid', options, () => {}), TypeError)
    assert.equal(kit.cases.length, 0)
  }
})

test('317 testing kit: registration closes when collection finishes', () => {
  const kit = createPluginTestKit317()
  kit.finishCollecting()
  assert.throws(() => kit.namespace.test('late', () => {}), TypeError)
  assert.throws(() => kit.namespace.describe('late', () => {}), TypeError)
})
