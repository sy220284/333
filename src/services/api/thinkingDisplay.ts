/** In streaming print mode, incremental thought display follows the API request. */
export function resolveThinkingDisplayMode317(
  nonInteractive: boolean,
  partialMessages: boolean | undefined,
): 'updates' | 'omitted' {
  return !nonInteractive || partialMessages === true ? 'updates' : 'omitted'
}

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

const unsupportedDisplay = new Set<string>()

/** Probe a refused display hint and cache only a successful field removal. */
export function createThinkingDisplayRecovery317(cacheKey?: string) {
  let display: string | undefined
  let phase: 'initial' | 'probe' | 'withoutField' = 'initial'
  const cached = cacheKey !== undefined && unsupportedDisplay.has(cacheKey)
  return {
    prepare<T extends { thinking?: object | null }>(params: T): T {
      display = getRequestThinkingDisplay(params.thinking)
      if ((!cached && phase !== 'withoutField') || display === undefined || !params.thinking) return params
      const thinking = { ...params.thinking } as Record<string, unknown>
      delete thinking.display
      return { ...params, thinking }
    },
    retry(error: { status?: number; message: string; type?: string }): boolean {
      if (cached || phase === 'withoutField' || display === undefined ||
          (error.status !== 400 && error.status !== 422) || error.type === 'billing_error') return false
      const explicit = /thinking(?:\W+\w+){0,2}\W+display/i.test(error.message)
      if (!explicit && /credit balance|billing|permission|authentication|context (?:length|limit|window)|too many tokens|model.*not found|content policy/i.test(error.message)) return false
      phase = !explicit && display === 'updates' && phase === 'initial' ? 'probe' : 'withoutField'
      return true
    },
    accepted() {
      if (phase !== 'withoutField' || display === undefined || cacheKey === undefined) return
      if (unsupportedDisplay.size >= 256) unsupportedDisplay.clear()
      unsupportedDisplay.add(cacheKey)
    },
  }
}
