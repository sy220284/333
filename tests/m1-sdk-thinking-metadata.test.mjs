import assert from 'node:assert/strict'
import test from 'node:test'
import { toSDKThinkingMetadata } from '../src/entrypoints/sdk/thinkingMessageMetadata.ts'

const message = content => ({ type: 'assistant', message: { content }, thinkingDisplay: 'summarized', thinkingDurationMs: 23 })

test('thinking metadata travels only on a single thinking content block', () => {
  const thinking = [{ type: 'thinking', thinking: 'planning' }]
  assert.deepEqual(toSDKThinkingMetadata(message(thinking), thinking), { thinking_duration_ms: 23, thinking_display: 'summarized' })
  assert.deepEqual(toSDKThinkingMetadata(message(thinking), [{ type: 'text', text: 'done' }]), {})
  assert.deepEqual(toSDKThinkingMetadata(message([...thinking, { type: 'text', text: 'done' }]), thinking), {})
  assert.deepEqual(toSDKThinkingMetadata(message(thinking), [...thinking, ...thinking]), {})
})

test('only positive safe integer durations and string display modes reach the SDK', () => {
  const thinking = [{ type: 'thinking', thinking: 'x' }]
  for (const duration of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, undefined]) {
    assert.deepEqual(toSDKThinkingMetadata({ ...message(thinking), thinkingDurationMs: duration }, thinking), { thinking_display: 'summarized' })
  }
  assert.deepEqual(toSDKThinkingMetadata({ ...message(thinking), thinkingDisplay: null }, thinking), { thinking_duration_ms: 23 })
})

