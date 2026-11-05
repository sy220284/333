import assert from 'node:assert/strict'
import test from 'node:test'

let mapper = {}
try {
  mapper = await import('../src/entrypoints/sdk/streamEventMapper.ts')
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
}

function functions() {
  assert.equal(typeof mapper.toSDKStreamEvent, 'function')
  assert.equal(typeof mapper.fromSDKStreamEvent, 'function')
  return mapper
}

test('maps source response metadata into the public stream envelope and back', () => {
  const { toSDKStreamEvent, fromSDKStreamEvent } = functions()
  const source = {
    type: 'stream_event',
    event: { type: 'message_stop' },
    ttftMs: 42,
    apiMessageId: 'msg-real-id',
    thinkingDisplay: 'updates',
    abandonedBlocks: { apiMessageId: 'msg-real-id', fromBlockIndex: 3 },
    textRunsJoined: true,
  }
  const sdk = toSDKStreamEvent(source, 'session-a', '00000000-0000-4000-8000-000000000001')
  assert.deepEqual(sdk, {
    type: 'stream_event', event: source.event, session_id: 'session-a', parent_tool_use_id: null, uuid: '00000000-0000-4000-8000-000000000001',
    ttft_ms: 42, api_message_id: 'msg-real-id', thinking_display: 'updates',
    abandoned_blocks: { api_message_id: 'msg-real-id', from_block_index: 3 },
    text_runs_joined: true,
  })
  assert.deepEqual(fromSDKStreamEvent(sdk), source)
})

test('missing metadata stays absent and a false joined flag is not emitted', () => {
  const { toSDKStreamEvent, fromSDKStreamEvent } = functions()
  const source = { type: 'stream_event', event: { type: 'message_stop' }, textRunsJoined: false }
  const sdk = toSDKStreamEvent(source, 's', '00000000-0000-4000-8000-000000000002')
  assert.deepEqual(sdk, { type: 'stream_event', event: source.event, session_id: 's', parent_tool_use_id: null, uuid: '00000000-0000-4000-8000-000000000002' })
  assert.deepEqual(fromSDKStreamEvent(sdk), { type: 'stream_event', event: source.event })
})
