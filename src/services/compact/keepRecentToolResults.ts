import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { Message } from '../../types/message.js'

/**
 * The 2.1.310 context_hint rejection path, reconstructed from
 * chunk-wany0nxw.js:1572-1626 and chunk-wf28mfqa.js:425-453.
 * The separate idle-time cache-edit path keeps twelve tool calls; it must not
 * change this path's five-call retention policy.
 */
export const CONTEXT_HINT_KEEP_RECENT = 5
export const CONTEXT_HINT_MIN_SAVING_TOKENS = 20_000
export const CLEARED_TOOL_RESULT = '[Old tool result content cleared]'
export const PERSISTED_TOOL_RESULT_PREFIX = '<persisted-output>'

export type PersistToolOutput = (
  content: ToolResultBlockParam['content'],
  toolUseId: string,
) => Promise<string | null>

export type KeepRecentResult = {
  messages: Message[]
  tokensSaved: number
  clearedIds: Set<string>
  clearedContent: Map<string, string>
}

export type KeepRecentOptions = {
  keepRecent?: number
  minTokensSaved?: number
  /** The tool-name allowlist must match the same local tool set used by microcompact. */
  compactableTools: ReadonlySet<string>
  persist?: PersistToolOutput
  estimateTextTokens?: (text: string) => number
}

function alreadyCleared(content: ToolResultBlockParam['content']): boolean {
  if (typeof content !== 'string') return false
  const candidate = content.startsWith(CLEARED_TOOL_RESULT)
    ? content.slice(CLEARED_TOOL_RESULT.length)
    : content
  return candidate === '' || candidate.startsWith(PERSISTED_TOOL_RESULT_PREFIX)
}

function countResultTokens(
  result: ToolResultBlockParam,
  estimate: (text: string) => number,
): number {
  const content = result.content
  if (!content) return 0
  if (typeof content === 'string') return estimate(content)
  if (!Array.isArray(content)) return 0
  return content.reduce((total, part) => {
    if (part.type === 'text') return total + estimate(part.text)
    // The public SDK currently types inline results as text | image.
    // Document blocks from newer servers also take the same ~2k estimate.
    return total + 2000
  }, 0)
}

/** This is also used by the request hook before advertising context_hint. */
export function getKeepRecentCandidates(
  messages: Message[],
  options: KeepRecentOptions,
): {
  keepIds: Set<string>
  candidates: ToolResultBlockParam[]
  tokensSaved: number
} {
  const qualifiedIds: string[] = []
  for (const message of messages) {
    if (message.type !== 'assistant' || !Array.isArray(message.message.content)) continue
    for (const block of message.message.content) {
      if (block.type === 'tool_use' && options.compactableTools.has(block.name)) {
        qualifiedIds.push(block.id)
      }
    }
  }
  const keep = new Set(qualifiedIds.slice(-Math.max(1, options.keepRecent ?? CONTEXT_HINT_KEEP_RECENT)))
  const clear = new Set(qualifiedIds.filter(id => !keep.has(id)))
  const candidates: ToolResultBlockParam[] = []
  let tokensSaved = 0
  // Match roughTokenCountEstimation's Math.round(length / 4) without loading
  // the entire API/model/renderer module graph in compact-only tests.
  const estimate = options.estimateTextTokens ?? ((text: string) => Math.round(text.length / 4))
  for (const message of messages) {
    if (message.type !== 'user' || !Array.isArray(message.message.content)) continue
    for (const block of message.message.content) {
      if (block.type !== 'tool_result' || !clear.has(block.tool_use_id) || alreadyCleared(block.content)) continue
      candidates.push(block)
      tokensSaved += countResultTokens(block, estimate)
    }
  }
  return { keepIds: keep, candidates, tokensSaved }
}

/**
 * Persist originals before replacing any message. If persistence fails, the
 * original conversation remains untouched and the error reaches the caller.
 * Images and documents use the documented cleared marker because their
 * inline representations cannot be recreated from a text reference.
 */
export async function keepRecentToolResults(
  messages: Message[],
  options: KeepRecentOptions,
): Promise<KeepRecentResult | null> {
  const { keepIds, candidates, tokensSaved } = getKeepRecentCandidates(messages, options)
  if (tokensSaved < (options.minTokensSaved ?? CONTEXT_HINT_MIN_SAVING_TOKENS)) return null

  const clearedIds = new Set(candidates.map(c => c.tool_use_id))
  const clearedContent = new Map<string, string>()
  for (const result of candidates) {
    const replacement = result.content
      ? await options.persist?.(result.content, result.tool_use_id)
      : null
    clearedContent.set(result.tool_use_id, replacement ?? CLEARED_TOOL_RESULT)
  }
  const updated = messages.map(message => {
    if (message.type !== 'user' || !Array.isArray(message.message.content)) return message
    let changed = false
    const blocks = message.message.content.map(block => {
      if (block.type !== 'tool_result' || !clearedIds.has(block.tool_use_id)) return block
      const hasMedia =
        Array.isArray(block.content) &&
        block.content.some(part => part.type !== 'text')
      const content = hasMedia
        ? CLEARED_TOOL_RESULT
        : (clearedContent.get(block.tool_use_id) ?? CLEARED_TOOL_RESULT)
      if (block.content === content) return block
      changed = true
      return { ...block, content }
    })
    return changed ? { ...message, message: { ...message.message, content: blocks } } : message
  })
  void keepIds
  return { messages: updated, tokensSaved, clearedIds, clearedContent }
}
