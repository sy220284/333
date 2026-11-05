import assert from 'node:assert/strict'
import test from 'node:test'
import { createThinkingDisplayRecovery317 } from '../src/services/api/thinkingDisplay.js'

test('explicit 400/422 display rejection removes the hint once without disabling thinking', () => {
  for (const status of [400, 422]) {
    const recovery = createThinkingDisplayRecovery317()
    const params = { thinking: { type: 'enabled', budget_tokens: 1024, display: 'updates' } }
    assert.equal(recovery.prepare(params), params)
    assert.equal(recovery.retry({ status, message: 'authentication is invalid' }), false)
    assert.equal(recovery.retry({ status, message: 'Unsupported field: thinking.display' }), true)
    assert.deepEqual(recovery.prepare(params), { thinking: { type: 'enabled', budget_tokens: 1024 } })
    assert.equal(params.thinking.display, 'updates')
    assert.equal(recovery.retry({ status, message: 'Unsupported field: thinking.display' }), false)
  }
})

test('unknown rejection probes before removing display and caches successful recovery by key', () => {
  const key = 'test-session'
  const params = { thinking: { type: 'adaptive', display: 'updates' } }
  const recovery = createThinkingDisplayRecovery317(key)
  const error = { status: 422, message: 'Unrecognized request' }
  assert.equal(recovery.prepare(params), params)
  assert.equal(recovery.retry(error), true)
  assert.equal(recovery.prepare(params), params)
  assert.equal(recovery.retry(error), true)
  assert.deepEqual(recovery.prepare(params), { thinking: { type: 'adaptive' } })
  assert.equal(recovery.retry(error), false)
  assert.equal(createThinkingDisplayRecovery317(key).prepare(params), params)
  recovery.accepted()
  assert.deepEqual(createThinkingDisplayRecovery317(key).prepare(params), { thinking: { type: 'adaptive' } })
  assert.equal(createThinkingDisplayRecovery317('other-session').prepare(params), params)
})
