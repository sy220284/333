import type { UUID } from 'node:crypto'
import type { StreamEvent } from '../../types/message.js'
import type { SDKPartialAssistantMessage } from './coreTypes.generated.js'

/** Preserve the response identity and display metadata across the SDK boundary. */
export function toSDKStreamEvent(
  message: StreamEvent,
  sessionId: string,
  uuid: UUID,
): SDKPartialAssistantMessage {
  return {
    type: 'stream_event',
    event: message.event,
    session_id: sessionId,
    parent_tool_use_id: null,
    uuid,
    ...(message.ttftMs !== undefined && { ttft_ms: message.ttftMs }),
    ...(message.apiMessageId !== undefined && { api_message_id: message.apiMessageId }),
    ...(message.thinkingDisplay !== undefined && { thinking_display: message.thinkingDisplay }),
    ...(message.abandonedBlocks !== undefined && {
      abandoned_blocks: {
        api_message_id: message.abandonedBlocks.apiMessageId,
        from_block_index: message.abandonedBlocks.fromBlockIndex,
      },
    }),
    ...(message.textRunsJoined && { text_runs_joined: true as const }),
  }
}

export function fromSDKStreamEvent(message: SDKPartialAssistantMessage): StreamEvent {
  return {
    type: 'stream_event',
    event: message.event,
    ...(message.ttft_ms !== undefined && { ttftMs: message.ttft_ms }),
    ...(message.api_message_id !== undefined && { apiMessageId: message.api_message_id }),
    ...(message.thinking_display !== undefined && { thinkingDisplay: message.thinking_display }),
    ...(message.abandoned_blocks !== undefined && {
      abandonedBlocks: {
        apiMessageId: message.abandoned_blocks.api_message_id,
        fromBlockIndex: message.abandoned_blocks.from_block_index,
      },
    }),
    ...(message.text_runs_joined && { textRunsJoined: true }),
  }
}
