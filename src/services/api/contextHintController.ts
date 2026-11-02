import type { Message } from '../../types/message.js'
import {
  type KeepRecentOptions,
  getKeepRecentCandidates,
  keepRecentToolResults,
} from '../compact/keepRecentToolResults.js'

/** 2.1.310: chunk-at88wjsn.js:1449 and chunk-wf28mfqa.js:426-453. */
export const CONTEXT_HINT_BETA = 'context-hint-2026-04-09'
export const CONTEXT_HINT_TARGET_TOKENS = 75_000

export type HintError = {
  status?: number
  message?: string
  requestID?: string
  error?: { error?: { type?: string } }
}

export class ContextHintRecoveryError extends Error {
  constructor(readonly recovery: HintRecovery) {
    super('The server rejected context_hint; retry without it')
    this.name = 'ContextHintRecoveryError'
  }
}

export type HintRecovery = {
  messages: Message[]
  clearedIds: Set<string>
  clearedContent: Map<string, string>
  tokensSaved: number
}

/**
 * A single request/controller lifetime. The header is advertised only for
 * first-party main-thread queries while the feature is enabled. On rejection
 * the feature is stripped and the exact original request is retried at most
 * once, with content clearing limited to the target's 20k-token threshold.
 */
export function createContextHintController(options: KeepRecentOptions & {
  enabled: boolean
  firstParty: boolean
  querySource: string
  targetTokensSaved?: number
  is529Error?: (error: HintError) => boolean
}) {
  if (!options.firstParty || !options.querySource.startsWith('repl_main_thread')) {
    return null
  }
  let stripped = false
  let sent = false
  let streamFallbackAllowed = false
  const eligible = options.enabled
  const clean = async (messages: Message[]): Promise<HintRecovery> => {
    const result = await keepRecentToolResults(messages, options)
    return {
      messages: result?.messages ?? messages,
      clearedIds: result?.clearedIds ?? new Set(),
      clearedContent: result?.clearedContent ?? new Map(),
      tokensSaved: result?.tokensSaved ?? 0,
    }
  }
  return {
    active: eligible,
    buildRequestParams(messages: Message[]) {
      sent = false
      if (!eligible || stripped) return null
      sent = true
      const count = getKeepRecentCandidates(messages, options).tokensSaved
      const target = options.targetTokensSaved ?? CONTEXT_HINT_TARGET_TOKENS
      return {
        beta: CONTEXT_HINT_BETA,
        body: count >= 20_000
          ? { context_hint: { enabled: true, ...(target > 0 ? { target_tokens_saved: target } : {}) } }
          : null,
      }
    },
    async onRequestError(error: HintError, messages: Message[]): Promise<HintRecovery | null> {
      if (!sent || stripped) return null
      if (error.status === 422 || error.status === 424) {
        stripped = true
        return clean(messages)
      }
      if (error.status === 400 && (error.message?.includes('anthropic-beta') ?? false)) {
        stripped = true
        return { messages, clearedIds: new Set(), clearedContent: new Map(), tokensSaved: 0 }
      }
      if (error.status === 409 || options.is529Error?.(error)) {
        stripped = true
      }
      return null
    },
    classifyStreamError(error: HintError): boolean {
      streamFallbackAllowed = false
      if (!sent || stripped || error.status !== undefined) return false
      if (error.error?.error?.type !== 'invalid_request_error') return false
      streamFallbackAllowed = true
      return true
    },
    async onStreamFallback(messages: Message[]): Promise<HintRecovery | null> {
      const allowed = streamFallbackAllowed
      stripped = true
      streamFallbackAllowed = false
      return allowed ? clean(messages) : null
    },
    strip() { stripped = true },
  }
}
