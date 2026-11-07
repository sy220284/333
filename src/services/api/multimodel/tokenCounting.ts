/**
 * Independent providers use local token estimation until their supported
 * endpoints expose a verified native count API.
 */
import type { BetaMessageParam, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { estimateContentTokens } from '../../contentTokenEstimation.js'
import { resolveIndependentModel } from './registry.js'

export type IndependentTokenCount = { tokens: number; kind: 'local-estimate' }

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
): Promise<IndependentTokenCount> {
  if (!resolveIndependentModel(model)) throw new Error('Expected supported qualified remote model ID')
  return { tokens: estimate(messages, tools), kind: 'local-estimate' }
}
