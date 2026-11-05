import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveModelBehavior317 } from '../src/utils/model/modelBehavior317.js'

test('317 resolves configured behavior through aliases without rewriting known models', () => {
  const rows = [
    { model: 'custom', behavesAs: 'internal' },
    { model: 'internal', behavesAs: 'claude-sonnet-4-6' },
    { model: 'claude-sonnet-4-6', behavesAs: 'claude-haiku-4-5' },
  ]
  assert.equal(resolveModelBehavior317('Custom', rows), 'claude-sonnet-4-6')
  assert.equal(resolveModelBehavior317('claude-sonnet-4-6', rows), 'claude-sonnet-4-6')
  assert.equal(resolveModelBehavior317('custom', [{ model: 'custom', behavesAs: 'custom' }]), 'custom')
  assert.equal(resolveModelBehavior317('custom', [{ model: 'custom', behavesAs: 'unknown' }]), 'custom')
})
