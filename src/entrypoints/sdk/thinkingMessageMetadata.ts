type AssistantThinkingMetadata = {
  message: { content: unknown }
  thinkingDurationMs?: unknown
  thinkingDisplay?: unknown
}

/** 2.1.310 sends thinking metadata only on a single normalized thinking block. */
export function toSDKThinkingMetadata(message: AssistantThinkingMetadata, content: unknown): {
  thinking_duration_ms?: number
  thinking_display?: string
} {
  if (!Array.isArray(message.message.content) || message.message.content.length !== 1 ||
      !Array.isArray(content) || content.length !== 1 || content[0]?.type !== 'thinking') return {}
  const duration = message.thinkingDurationMs
  const display = message.thinkingDisplay
  return {
    ...(typeof duration === 'number' && Number.isSafeInteger(duration) && duration >= 1 && { thinking_duration_ms: duration }),
    ...(typeof display === 'string' && { thinking_display: display }),
  }
}

