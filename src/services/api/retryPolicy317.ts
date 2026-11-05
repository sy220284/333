/** Retry arithmetic shared by the production API loop and source-mode checks.
 * Official 2.1.317: chunk-r6v32v6p I$, chunk-thp9mgjc YZe and overflow branch.
 */
export const BASE_DELAY_MS = 500
export const RETRY_JITTER_RATIO = 0.25
export const FLOOR_OUTPUT_TOKENS = 3000

export function getRetryDelay(
  attempt: number,
  retryAfterHeader?: string | null,
  maxDelayMs: number = 32000,
  random: () => number = Math.random,
  baseDelayMs: number = BASE_DELAY_MS,
): number {
  const base = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
  const backoff = Math.round(base + random() * RETRY_JITTER_RATIO * base)
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10)
    if (!Number.isNaN(seconds)) return Math.max(seconds * 1000, backoff)
  }
  return backoff
}

export function getRetryWaitLimit(overloadedMaxDelayMs?: number): number {
  return Math.max(60000, Math.ceil((overloadedMaxDelayMs ?? 0) * (1 + RETRY_JITTER_RATIO)))
}

export function getRetryLimit(value: string | undefined, persistent: boolean): number {
  if (value !== undefined && Number(value) >= 0) {
    return persistent ? Number(value) : Math.min(Number(value), 15)
  }
  return persistent ? 300 : 10
}

export function adjustOverflowOutputTokens(
  inputTokens: number,
  contextLimit: number,
  previousOverride?: number,
): number | undefined {
  const available = Math.max(0, contextLimit - inputTokens - 1000)
  if (available < FLOOR_OUTPUT_TOKENS || (previousOverride !== undefined && available >= previousOverride)) return undefined
  return available
}
