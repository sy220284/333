/** 317 chunk-vd94phfe Sc/i3/uYe and chunk-thp9mgjc a1o. */
export type TextTokenEstimator = (text: string, bytesPerToken?: number) => number
const defaultTextEstimate: TextTokenEstimator = (text, bytesPerToken = 4) => Math.round(text.length / bytesPerToken)

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function textTokens(value: unknown, estimate: TextTokenEstimator, bytesPerToken?: number): number {
  return typeof value === 'string' ? estimate(value, bytesPerToken) : 0
}

export function estimateContentTokens(content: unknown, bytesPerToken?: number, estimate: TextTokenEstimator = defaultTextEstimate): number {
  if (typeof content === 'string') return estimate(content, bytesPerToken)
  if (!Array.isArray(content)) return 0
  return content.reduce((sum: number, block: unknown) => sum + estimateContentBlockTokens(block, bytesPerToken, estimate), 0)
}

export function estimateContentBlockTokens(block: unknown, bytesPerToken?: number, estimate: TextTokenEstimator = defaultTextEstimate): number {
  if (typeof block === 'string') return estimate(block, bytesPerToken)
  if (!object(block)) return 0
  if (block.type === 'text') return textTokens(block.text, estimate, bytesPerToken)
  if (block.type === 'document' && object(block.source)) {
    const source = block.source
    if (source.type === 'text') {
      const extension = typeof block.title === 'string' ? block.title.split('.').at(-1)?.toLowerCase() : undefined
      const density = extension && ['json', 'jsonl', 'jsonc'].includes(extension) ? 2 : 4
      return textTokens(source.data, estimate, bytesPerToken === undefined ? density : Math.min(bytesPerToken, density))
    }
    if (source.type === 'content') {
      if (typeof source.content === 'string') return estimate(source.content, bytesPerToken)
      if (Array.isArray(source.content)) return estimateContentTokens(source.content.filter(object), bytesPerToken, estimate)
    }
  }
  if (block.type === 'image' || block.type === 'document') return 2000
  if (block.type === 'tool_result') return estimateContentTokens(block.content, bytesPerToken, estimate)
  if (block.type === 'tool_use') return textTokens(String(block.name) + JSON.stringify(block.input ?? {}), estimate, bytesPerToken)
  if (block.type === 'thinking') return textTokens(block.thinking, estimate, bytesPerToken)
  if (block.type === 'redacted_thinking') return textTokens(block.data, estimate, bytesPerToken)
  return textTokens(JSON.stringify(block), estimate, bytesPerToken)
}

/** Tool-result savings exclude unrecognised blocks, as in the original a1o. */
export function estimateCompactToolContent(content: unknown, estimate: TextTokenEstimator = defaultTextEstimate): number {
  if (typeof content === 'string') return estimate(content)
  if (!Array.isArray(content)) return 0
  return content.reduce((sum: number, block: unknown) => {
    if (typeof block === 'string') return sum + estimate(block)
    if (!object(block)) return sum
    if (block.type === 'text') return sum + textTokens(block.text, estimate)
    if (block.type === 'image') return sum + 2000
    if (block.type === 'document') return sum + estimateContentBlockTokens(block, undefined, estimate)
    if (block.type === 'search_result') return sum + estimateContentTokens(block.content, undefined, estimate)
    return sum
  }, 0)
}
