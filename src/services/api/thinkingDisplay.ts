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

/** Drop a display hint rejected by an endpoint while preserving thinking itself. */
export function createThinkingDisplayRecovery317() {
  let display: string | undefined
  let removed = false
  return {
    prepare<T extends { thinking?: object | null }>(params: T): T {
      display = getRequestThinkingDisplay(params.thinking)
      if (!removed || display === undefined || !params.thinking) return params
      const thinking = { ...params.thinking } as Record<string, unknown>
      delete thinking.display
      return { ...params, thinking }
    },
    retry(error: { status?: number; message: string }): boolean {
      if (removed || display === undefined || (error.status !== 400 && error.status !== 422)) return false
      if (!/thinking(?:\W+\w+){0,2}\W+display/i.test(error.message)) return false
      removed = true
      return true
    },
  }
}
