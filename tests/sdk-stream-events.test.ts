import { expect, test } from 'bun:test'
import {
  SDKPartialAssistantMessageSchema,
} from '../src/entrypoints/sdk/coreSchemas.js'
import type { SDKPartialAssistantMessage } from '../src/entrypoints/sdk/coreTypes.generated.js'

const envelope = (event: unknown) => ({
  type: 'stream_event',
  session_id: 'test-session',
  uuid: crypto.randomUUID(),
  parent_tool_use_id: null,
  event,
})

const valid = [
  { type: 'message_start', message: { type: 'message', id: 'msg-01', role: 'assistant', content: [] } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
  { type: 'message_stop' },
]
for (const event of valid) {
  test(`SSE ${event.type} validates without discarding its wire fields`, () => {
    const input = envelope(event)
    const parsed = SDKPartialAssistantMessageSchema().safeParse(input)
    expect(parsed.success).toBe(true)
    if (!parsed.success) throw parsed.error
    expect(parsed.data).toEqual(input)
    // Compiler-level proof: downstream code can discriminate the event type.
    const streamMessage: SDKPartialAssistantMessage = parsed.data
    expect(streamMessage.event.type).toBe(event.type)
  })
}

const invalid = [
  { type: 'message_start', message: { id: 12 } },
  { type: 'content_block_start', index: -1, content_block: { type: 'text' } },
  { type: 'content_block_delta', index: '0', delta: { type: 'text_delta', text: 'hi' } },
  { type: 'content_block_delta', index: 0, delta: null },
  { type: 'content_block_stop' },
  { type: 'made_up_event', data: 'not from Anthropic SSE' },
]
for (const event of invalid) {
  test(`malformed ${event.type} is rejected at SDK event boundary`, () => {
    expect(SDKPartialAssistantMessageSchema().safeParse(envelope(event)).success).toBe(false)
  })
}

test('stream metadata survives validation without losing response identity', () => {
  const input = {
    ...envelope({ type: 'message_stop' }),
    ttft_ms: 12,
    api_message_id: 'msg-api-id',
    thinking_display: 'updates',
    abandoned_blocks: { api_message_id: 'msg-api-id', from_block_index: 2 },
    text_runs_joined: true,
  }
  const parsed = SDKPartialAssistantMessageSchema().safeParse(input)
  expect(parsed.success).toBe(true)
  if (!parsed.success) throw parsed.error
  expect(parsed.data).toEqual(input)
  const malformed = SDKPartialAssistantMessageSchema().safeParse({
    ...input, abandoned_blocks: { api_message_id: 'msg-api-id', from_block_index: -1 },
  })
  expect(malformed.success).toBe(false)
})
