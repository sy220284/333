import { expect, test } from 'bun:test'
import type { SDKPartialAssistantMessage } from '../src/entrypoints/sdk/coreTypes.generated.js'
import {
  accumulateStreamEvents,
  clearStreamAccumulatorForMessage,
  createStreamAccumulator,
} from '../src/cli/transports/streamAccumulator.js'

const event = (type: string, payload: Record<string, unknown>, opts?: {
  scope?: string; session?: string; uuid?: string
}) => ({
  type: 'stream_event' as const,
  session_id: opts?.session ?? 'session-a',
  parent_tool_use_id: opts?.scope ?? null,
  uuid: opts?.uuid ?? crypto.randomUUID(),
  event: { type, ...payload },
}) as unknown as SDKPartialAssistantMessage
const start = (id: string, opts?: { scope?: string; session?: string }) =>
  event('message_start', { message: { type: 'message', id, content: [], role: 'assistant' } }, opts)
const delta = (text: string, index = 0, opts?: { scope?: string; session?: string; uuid?: string }) =>
  event('content_block_delta', { index, delta: { type: 'text_delta', text } }, opts)
const textDelta = (item: unknown) =>
  (item as { event: { delta?: { text?: string } } }).event.delta?.text

test('multiple text deltas in one flush send one full snapshot with first UUID', () => {
  const state = createStreamAccumulator()
  const output = accumulateStreamEvents([
    start('message-a'),
    delta('A', 0, { uuid: 'delta-original' }),
    delta('B'),
    delta('C'),
  ], state)
  expect(output).toHaveLength(2)
  expect(textDelta(output[1])).toBe('ABC')
  expect(output[1]?.uuid).toBe('delta-original')
})

test('subsequent batches emit a complete snapshot and reconnect can reconstruct text', () => {
  const state = createStreamAccumulator()
  accumulateStreamEvents([start('message-b'), delta('previous')], state)
  const second = accumulateStreamEvents([delta('-new')], state)
  expect(second).toHaveLength(1)
  expect(textDelta(second[0])).toBe('previous-new')
})

test('parallel messages in separate scopes never mix text or cleanup', () => {
  const state = createStreamAccumulator()
  accumulateStreamEvents([start('parent'), start('child', { scope: 'tool-42' })], state)
  const chunks = accumulateStreamEvents([
    delta('MAIN'),
    delta('CHILD', 0, { scope: 'tool-42' }),
  ], state)
  expect(chunks.map(textDelta)).toEqual(['MAIN', 'CHILD'])
  clearStreamAccumulatorForMessage(state, {
    session_id: 'session-a',
    parent_tool_use_id: null,
    message: { id: 'parent' },
  })
  expect(state.byMessage.has('parent')).toBe(false)
  expect(state.byMessage.has('child')).toBe(true)
})

test('message_start retry with same id preserves already delivered bytes', () => {
  const state = createStreamAccumulator()
  accumulateStreamEvents([start('retry-message'), delta('kept')], state)
  const next = accumulateStreamEvents([start('retry-message'), delta('next')], state)
  expect(textDelta(next[1])).toBe('keptnext')
})

test('non-text deltas bypass aggregation and message completion frees state', () => {
  const state = createStreamAccumulator()
  const update = event('content_block_delta', {
    index: 0,
    delta: { type: 'input_json_delta', partial_json: '{' },
  })
  const out = accumulateStreamEvents([start('tool-message'), update], state)
  expect(out).toHaveLength(2)
  expect(out[1]).toBe(update)
  clearStreamAccumulatorForMessage(state, {
    session_id: 'session-a',
    parent_tool_use_id: null,
    message: { id: 'tool-message' },
  })
  expect(state.byMessage.size).toBe(0)
  expect(state.scopeToMessage.size).toBe(0)
  expect(accumulateStreamEvents([delta('orphan')], state)).toHaveLength(1)
})
