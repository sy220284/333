import { expect, test } from 'bun:test'
import { SDKAssistantMessageSchema } from '../src/entrypoints/sdk/coreSchemas.js'

const frame = {
  type: 'assistant',
  uuid: '123e4567-e89b-42d3-a456-426614174000',
  session_id: 'session',
  parent_tool_use_id: null,
  message: {
    type: 'message', id: 'msg_test', role: 'assistant', model: 'claude-sonnet-4-6',
    content: [{ type: 'thinking', thinking: 'planning', signature: 'sig' }],
    stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 2 },
  },
}

test('assistant thinking frame retains display mode and positive elapsed time', () => {
  const result = SDKAssistantMessageSchema().safeParse({ ...frame, thinking_display: 'updates', thinking_duration_ms: 17 })
  expect(result.success).toBe(true)
  if (!result.success) throw result.error
  expect(result.data.thinking_display).toBe('updates')
  expect(result.data.thinking_duration_ms).toBe(17)
})

test('malformed optional thinking metadata is discarded without rejecting the frame', () => {
  const result = SDKAssistantMessageSchema().safeParse({ ...frame, thinking_display: 7, thinking_duration_ms: -1 })
  expect(result.success).toBe(true)
  if (!result.success) throw result.error
  expect(result.data.thinking_display).toBeUndefined()
  expect(result.data.thinking_duration_ms).toBeUndefined()
})
