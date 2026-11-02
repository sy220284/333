import type { SDKPartialAssistantMessage } from '../../entrypoints/sdk/coreTypes.generated.js'

type StreamPayload = SDKPartialAssistantMessage & { uuid: string }
type CoalescedStreamEvent = {
  type: 'stream_event'
  uuid: string
  session_id: string
  parent_tool_use_id: string | null
  event: {
    type: 'content_block_delta'
    index: number
    delta: { type: 'text_delta'; text: string }
  }
}

export type StreamAccumulatorState = {
  byMessage: Map<string, string[][]>
  scopeToMessage: Map<string, string>
}

export function createStreamAccumulator(): StreamAccumulatorState {
  return { byMessage: new Map(), scopeToMessage: new Map() }
}

function scopeKey(m: { session_id?: string; parent_tool_use_id?: string | null }): string {
  return `${m.session_id}:${m.parent_tool_use_id ?? ''}`
}

/**
 * Creates full-so-far text snapshots on each flush, while keeping original
 * non-text stream events unchanged. The state spans flushes, not just arrays.
 * This is used by the actual CCR uploader; do not replace its source of truth.
 */
export function accumulateStreamEvents(
  buffer: StreamPayload[],
  state: StreamAccumulatorState,
): Array<StreamPayload | CoalescedStreamEvent> {
  const out: Array<StreamPayload | CoalescedStreamEvent> = []
  const touched = new Map<string[], CoalescedStreamEvent>()
  for (const message of buffer) {
    switch (message.event.type) {
      case 'message_start': {
        const id = message.event.message.id
        const scope = scopeKey(message)
        const existing = state.scopeToMessage.get(scope)
        if (existing && existing !== id) state.byMessage.delete(existing)
        // On an idempotent message_start replay, keep the already accumulated
        // text; the uploader's dedupe key belongs to the first delta frame.
        if (!state.byMessage.has(id)) state.byMessage.set(id, [])
        state.scopeToMessage.set(scope, id)
        out.push(message)
        break
      }
      case 'content_block_delta': {
        if (message.event.delta.type !== 'text_delta') {
          out.push(message)
          break
        }
        const id = state.scopeToMessage.get(scopeKey(message))
        const blocks = id ? state.byMessage.get(id) : undefined
        if (!blocks) {
          out.push(message)
          break
        }
        const chunks = (blocks[message.event.index] ??= [])
        chunks.push(message.event.delta.text)
        const previous = touched.get(chunks)
        if (previous) {
          previous.event.delta.text = chunks.join('')
          break
        }
        const snapshot: CoalescedStreamEvent = {
          type: 'stream_event',
          uuid: message.uuid,
          session_id: message.session_id,
          parent_tool_use_id: message.parent_tool_use_id,
          event: {
            type: 'content_block_delta',
            index: message.event.index,
            delta: { type: 'text_delta', text: chunks.join('') },
          },
        }
        touched.set(chunks, snapshot)
        out.push(snapshot)
        break
      }
      default:
        out.push(message)
    }
  }
  return out
}

/** Called on the final assistant message, including abort/error completions. */
export function clearStreamAccumulatorForMessage(
  state: StreamAccumulatorState,
  assistant: {
    session_id: string
    parent_tool_use_id: string | null
    message: { id: string }
  },
): void {
  state.byMessage.delete(assistant.message.id)
  const scope = scopeKey(assistant)
  if (state.scopeToMessage.get(scope) === assistant.message.id) {
    state.scopeToMessage.delete(scope)
  }
}
