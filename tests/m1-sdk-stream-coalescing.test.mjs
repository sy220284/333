import assert from 'node:assert/strict'
import test from 'node:test'
import * as stream from '../src/cli/transports/streamAccumulator.ts'

function event(type, delta, extra = {}) {
  return {
    type: 'stream_event',
    session_id: 'session-a',
    parent_tool_use_id: null,
    uuid: crypto.randomUUID(),
    event: { type: 'content_block_delta', index: 0, delta: { type, ...delta } },
    ...extra,
  }
}
function coalesce(input) {
  assert.equal(typeof stream.coalesceStreamEvents, 'function', 'the target stream coalescer must exist')
  return stream.coalesceStreamEvents(input)
}

test('combines adjacent text pieces while retaining the first event and metadata', () => {
  const first = event('text_delta', { text: 'A' }, { uuid: 'first', api_message_id: 'msg', thinking_display: 'summary' })
  const next = event('text_delta', { text: 'B' }, { uuid: 'second', api_message_id: 'msg', thinking_display: 'summary' })
  const result = coalesce([first, next])
  assert.equal(result.length, 1)
  assert.equal(result[0].uuid, 'first')
  assert.equal(result[0].api_message_id, 'msg')
  assert.equal(result[0].thinking_display, 'summary')
  assert.equal(result[0].event.delta.text, 'AB')
  assert.equal(first.event.delta.text, 'A')
})

test('each upload batch carries only its own text increment', () => {
  const first = coalesce([event('text_delta', { text: 'hello' })])
  const next = coalesce([event('text_delta', { text: ' world' })])
  assert.equal(first[0].event.delta.text, 'hello')
  assert.equal(next[0].event.delta.text, ' world')
})

test('event type and intervening events preserve their original ordering', () => {
  const start = { type: 'stream_event', uuid: 'start', session_id: 'session-a', parent_tool_use_id: null, event: { type: 'message_start', message: { id: 'm' } } }
  const signature = event('signature_delta', { signature: 'sig' })
  const output = coalesce([
    start, event('text_delta', { text: 'A' }),
    event('input_json_delta', { partial_json: '{' }),
    event('input_json_delta', { partial_json: '}' }),
    signature, event('text_delta', { text: 'B' }),
  ])
  assert.equal(output.length, 5)
  assert.equal(output[0], start)
  assert.equal(output[1].event.delta.text, 'A')
  assert.equal(output[2].event.delta.partial_json, '{}')
  assert.equal(output[3], signature)
  assert.equal(output[4].event.delta.text, 'B')
})

test('thinking deltas sum token estimates and preserve all extra fields', () => {
  const a = event('thinking_delta', { thinking: 'one', estimated_tokens: 2, extra: 'kept' })
  const b = event('thinking_delta', { thinking: 'two', estimated_tokens: 3 })
  const result = coalesce([a, b])
  assert.equal(result[0].event.delta.thinking, 'onetwo')
  assert.equal(result[0].event.delta.estimated_tokens, 5)
  assert.equal(result[0].event.delta.extra, 'kept')
  const unknown = coalesce([event('thinking_delta', { thinking: 'a' }), event('thinking_delta', { thinking: 'b' })])
  assert.equal(unknown[0].event.delta.estimated_tokens, null)
})

test('different parent tool, API message, display mode or content index breaks a group', () => {
  const a = event('text_delta', { text: 'a' }, { parent_tool_use_id: 'p1', api_message_id: 'm1', thinking_display: 'full' })
  const b = event('text_delta', { text: 'b' }, { parent_tool_use_id: 'p2', api_message_id: 'm1', thinking_display: 'full' })
  const c = event('text_delta', { text: 'c' }, { parent_tool_use_id: 'p2', api_message_id: 'm2', thinking_display: 'full' })
  const d = event('text_delta', { text: 'd' }, { parent_tool_use_id: 'p2', api_message_id: 'm2', thinking_display: 'summary' })
  const e = event('text_delta', { text: 'e' }, { parent_tool_use_id: 'p2', api_message_id: 'm2', thinking_display: 'summary' })
  e.event.index = 1
  assert.deepEqual(coalesce([a, b, c, d, e]).map(x => x.event.delta.text), ['a', 'b', 'c', 'd', 'e'])
})

test('the size bound counts JSON-escaped UTF-8 bytes, not JavaScript characters', () => {
  const a = event('text_delta', { text: 'a'.repeat(57343) })
  const b = event('text_delta', { text: 'b' })
  const c = event('text_delta', { text: '\n' })
  const result = coalesce([a, b, c])
  assert.equal(result.length, 2)
  assert.equal(result[0].event.delta.text.length, 57344)
  assert.equal(result[1], c)
})

test('an individually oversized ephemeral event is reported and excluded from upload', () => {
  assert.equal(typeof stream.prepareStreamEventsForUpload, 'function')
  const oversized = event('text_delta', { text: 'x'.repeat(61440) })
  const normal = event('text_delta', { text: 'ok' })
  const reported = []
  const output = stream.prepareStreamEventsForUpload([oversized, normal], (item, bytes) => {
    reported.push({ item, bytes })
  })
  assert.deepEqual(output, [normal])
  assert.equal(reported[0].item, oversized)
  assert.ok(reported[0].bytes > 61440)
})
