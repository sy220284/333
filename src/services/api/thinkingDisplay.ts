/** Read the display mode from the request that actually produced this stream. */
export function getRequestThinkingDisplay(thinking: unknown): string | undefined {
  try {
    if (typeof thinking !== 'object' || thinking === null || !('display' in thinking)) return undefined
    // Stream metadata must reflect the actual outgoing request. The default
    // "updates" value is applied by the API request builder, not invented here.
    return typeof thinking.display === 'string' ? thinking.display : undefined
  } catch {
    return undefined
  }
}

/** Only thinking-related events carry the display metadata in 2.1.310. */
export function getStreamThinkingDisplay(event: unknown, display: string | undefined): string | undefined {
  try {
    if (display === undefined || typeof event !== 'object' || event === null || !('type' in event)) return undefined
    const part = event as { type: string; content_block?: { type?: string }; delta?: { type?: string } }
    return part.type === 'message_start' ||
      part.type === 'content_block_start' && part.content_block?.type === 'thinking' ||
      part.type === 'content_block_delta' && part.delta?.type === 'thinking_delta'
      ? display
      : undefined
  } catch {
    return undefined
  }
}
