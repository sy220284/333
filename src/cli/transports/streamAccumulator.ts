import type { SDKPartialAssistantMessage } from '../../entrypoints/sdk/coreTypes.generated.js'

type StreamPayload = SDKPartialAssistantMessage & {
  uuid: string
  api_message_id?: string
  thinking_display?: unknown
}
type DeltaEvent = Extract<StreamPayload['event'], { type: 'content_block_delta' }>
type DeltaKind = 'text_delta' | 'input_json_delta' | 'thinking_delta'
type Group = {
  first: StreamPayload
  firstEvent: DeltaEvent
  kind: DeltaKind
  accumulated: string
  bytes: number
  count: number
  estimatedTokens?: number
}

// 2.1.310 chunk-bc0w6gb3.js:50-92 and :1388-1396.
const MAX_EVENT_BYTES = 61_440
const MAX_MERGED_DELTA_BYTES = MAX_EVENT_BYTES - 4_096

function deltaChunk(event: StreamPayload['event']): {
  event: DeltaEvent
  kind: DeltaKind
  text: string
  estimatedTokens?: number
} | null {
  if (event.type !== 'content_block_delta') return null
  const delta = event.delta
  switch (delta.type) {
    case 'text_delta':
      return { event, kind: delta.type, text: delta.text }
    case 'input_json_delta':
      return { event, kind: delta.type, text: delta.partial_json }
    case 'thinking_delta':
      return {
        event,
        kind: delta.type,
        text: delta.thinking,
        estimatedTokens: 'estimated_tokens' in delta && typeof delta.estimated_tokens === 'number'
          ? delta.estimated_tokens
          : undefined,
      }
    default:
      return null
  }
}

function finish(group: Group): StreamPayload {
  if (group.count === 1) return group.first
  const delta = group.kind === 'text_delta'
    ? { type: group.kind, text: group.accumulated }
    : group.kind === 'input_json_delta'
      ? { type: group.kind, partial_json: group.accumulated }
      : { type: group.kind, thinking: group.accumulated, estimated_tokens: group.estimatedTokens ?? null }
  return {
    ...group.first,
    event: { ...group.firstEvent, delta: { ...group.firstEvent.delta, ...delta } },
  } as StreamPayload
}

/** Merge only adjacent compatible deltas in this upload batch. */
export function coalesceStreamEvents(events: StreamPayload[]): StreamPayload[] {
  if (events.length <= 1) return events
  const output: StreamPayload[] = []
  let group: Group | null = null
  for (const message of events) {
    const part = deltaChunk(message.event)
    if (!part) {
      if (group) output.push(finish(group))
      group = null
      output.push(message)
      continue
    }
    const bytes = Buffer.byteLength(JSON.stringify(part.text)) - 2
    if (group &&
        group.firstEvent.index === part.event.index &&
        group.kind === part.kind &&
        group.first.parent_tool_use_id === message.parent_tool_use_id &&
        group.first.thinking_display === message.thinking_display &&
        group.first.api_message_id === message.api_message_id &&
        group.bytes + bytes <= MAX_MERGED_DELTA_BYTES) {
      group.accumulated += part.text
      group.bytes += bytes
      group.count++
      if (typeof part.estimatedTokens === 'number') {
        group.estimatedTokens = (group.estimatedTokens ?? 0) + part.estimatedTokens
      }
      continue
    }
    if (group) output.push(finish(group))
    group = {
      first: message,
      firstEvent: part.event,
      kind: part.kind,
      accumulated: part.text,
      bytes,
      count: 1,
      estimatedTokens: part.estimatedTokens,
    }
  }
  if (group) output.push(finish(group))
  return output
}

/** The target skips an oversized ephemeral event, while keeping the durable response. */
export function prepareStreamEventsForUpload(
  events: StreamPayload[],
  reportOversize: (event: StreamPayload, bytes: number) => void,
): StreamPayload[] {
  return coalesceStreamEvents(events).filter(event => {
    const bytes = Buffer.byteLength(JSON.stringify(event))
    if (bytes <= MAX_EVENT_BYTES) return true
    reportOversize(event, bytes)
    return false
  })
}
