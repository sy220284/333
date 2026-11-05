import assert from 'node:assert/strict'
import test from 'node:test'
import { createThinkingDisplayRecovery317 } from '../src/services/api/thinkingDisplay.js'

test('explicit 400/422 display rejection removes the hint once without disabling thinking', () => {
  for (const status of [400, 422]) {
    const recovery = createThinkingDisplayRecovery317()
    const params = { thinking: { type: 'enabled', budget_tokens: 1024, display: 'updates' } }
    assert.equal(recovery.prepare(params), params)
    assert.equal(recovery.retry({ status, message: 'unrelated invalid request' }), false)
    assert.equal(recovery.retry({ status, message: 'Unsupported field: thinking.display' }), true)
    assert.deepEqual(recovery.prepare(params), { thinking: { type: 'enabled', budget_tokens: 1024 } })
    assert.equal(params.thinking.display, 'updates')
    assert.equal(recovery.retry({ status, message: 'Unsupported field: thinking.display' }), false)
  }
})
