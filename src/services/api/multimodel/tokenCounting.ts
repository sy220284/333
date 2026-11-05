/**
 * Remote-provider token counting. Gemini has a native countTokens endpoint;
 * other providers use the repository's existing content estimator until a
 * native counting API is available. No local inference models are loaded.
 */
import type { BetaMessageParam, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { estimateContentTokens } from '../../contentTokenEstimation.js'
import { getIndependentApiKey, resolveIndependentModel } from './registry.js'
import { toGemini } from './convert.js'

export type IndependentTokenCount = { tokens: number; kind: 'remote-exact' | 'local-estimate' }

function estimate(messages: BetaMessageParam[], tools: BetaToolUnion[]): number {
  const messageTokens = messages.reduce((total, message) =>
    total + estimateContentTokens(message.content) + 6, 0)
  const toolTokens = tools.reduce((total, tool) =>
    total + estimateContentTokens(JSON.stringify(tool)) + 20, 0)
  return Math.max(1, messageTokens + toolTokens)
}

export async function countIndependentModelTokens(
  model: string,
  messages: BetaMessageParam[],
  tools: BetaToolUnion[],
  fetcher: typeof fetch = fetch,
): Promise<IndependentTokenCount> {
  const route = resolveIndependentModel(model)
  if (!route) throw new Error('Expected qualified remote model ID')
  if (route.protocol !== 'gemini') {
    return { tokens: estimate(messages, tools), kind: 'local-estimate' }
  }
  const bearer = getIndependentApiKey(route)
  const request = toGemini({
    model, messages: messages as never, tools: tools as never,
    max_tokens: 1024, stream: false,
  })
  const url = `${route.endpoint}/models/${encodeURIComponent(route.model)}:countTokens?key=${encodeURIComponent(bearer)}`
  const result = await fetcher(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      generateContentRequest: {
        contents: request.contents,
        ...(request.systemInstruction ? { systemInstruction: request.systemInstruction } : {}),
        ...(request.tools ? { tools: request.tools } : {}),
      },
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!result.ok) throw new Error(`Gemini countTokens HTTP ${result.status}`)
  const value = await result.json() as { totalTokens?: unknown }
  if (!Number.isSafeInteger(value.totalTokens) || (value.totalTokens as number) < 0) {
    throw new Error('Gemini countTokens returned an invalid total')
  }
  return { tokens: value.totalTokens as number, kind: 'remote-exact' }
}
