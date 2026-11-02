import { expect, test } from 'bun:test'
import type { SDKPartialAssistantMessage } from '../src/entrypoints/sdk/coreTypes.generated.js'
import { coalesceStreamEvents, prepareStreamEventsForUpload } from '../src/cli/transports/streamAccumulator.js'

const delta = (text: string, uuid: string): SDKPartialAssistantMessage => ({
  type: 'stream_event',
  session_id: 'session-a',
  parent_tool_use_id: null,
  uuid,
  event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
})

test('the real Bun transport combines adjacent deltas without repeating earlier batches', () => {
  const first = coalesceStreamEvents([delta('A', 'one'), delta('B', 'two')])
  const second = coalesceStreamEvents([delta('C', 'three')])
  const firstEvent = first[0]?.event
  const secondEvent = second[0]?.event
  expect(firstEvent?.type).toBe('content_block_delta')
  expect(secondEvent?.type).toBe('content_block_delta')
  if (firstEvent?.type !== 'content_block_delta' || firstEvent.delta.type !== 'text_delta') throw Error('expected text delta')
  if (secondEvent?.type !== 'content_block_delta' || secondEvent.delta.type !== 'text_delta') throw Error('expected text delta')
  expect(firstEvent.delta.text).toBe('AB')
  expect(first[0]?.uuid).toBe('one')
  expect(secondEvent.delta.text).toBe('C')
})

test('oversized ephemeral messages are reported instead of blocking later events', () => {
  const sizes: number[] = []
  const result = prepareStreamEventsForUpload([delta('x'.repeat(61440), 'large')], (_, bytes) => { sizes.push(bytes) })
  expect(result).toEqual([])
  expect(sizes[0]).toBeGreaterThan(61440)
})
