import test from 'node:test'
import assert from 'node:assert/strict'
import { getRequestThinkingDisplay, getStreamThinkingDisplay } from '../src/services/api/thinkingDisplay.ts'

test('uses the actual request display only when it is a string', () => {
  assert.equal(getRequestThinkingDisplay({ type: 'adaptive', display: 'summarized' }), 'summarized')
  assert.equal(getRequestThinkingDisplay({ type: 'enabled', display: 'updates' }), 'updates')
  assert.equal(getRequestThinkingDisplay({ type: 'disabled' }), undefined)
  assert.equal(getRequestThinkingDisplay({ display: 7 }), undefined)
  assert.equal(getRequestThinkingDisplay(null), undefined)
  assert.equal(getRequestThinkingDisplay(new Proxy({}, { has() { throw Error('denied') } })), undefined)
})

test('attaches display to message start and thinking content only', () => {
  const events = [
    [{ type: 'message_start' }, 'summarized'],
    [{ type: 'content_block_start', content_block: { type: 'thinking' } }, 'summarized'],
    [{ type: 'content_block_delta', delta: { type: 'thinking_delta' } }, 'summarized'],
    [{ type: 'content_block_delta', delta: { type: 'signature_delta' } }, undefined],
    [{ type: 'content_block_start', content_block: { type: 'text' } }, undefined],
    [{ type: 'content_block_delta', delta: { type: 'text_delta' } }, undefined],
    [{ type: 'message_stop' }, undefined],
  ]
  for (const [event, expected] of events) {
    assert.equal(getStreamThinkingDisplay(event, 'summarized'), expected)
    assert.equal(getStreamThinkingDisplay(event, undefined), undefined)
  }
})
