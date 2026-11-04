import type { BetaUsage as Usage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from 'src/services/analytics/index.js'
import { logEvent } from 'src/services/analytics/index.js'
import { setHasUnknownModelCost } from '../bootstrap/state.js'
import { MODEL_CATALOG } from './model/modelCatalog.js'
import { isFastModeEnabled } from './fastMode.js'
import {
  getCanonicalName,
  getDefaultMainLoopModelSetting,
  type ModelShortName,
} from './model/model.js'

// @see https://platform.claude.com/docs/en/about-claude/pricing
export type ModelCosts = {
  inputTokens: number
  outputTokens: number
  promptCacheWriteTokens: number
  promptCacheReadTokens: number
  webSearchRequests: number
  promptCacheWrite1hTokens?: number
  longPrompt?: ModelCosts & { abovePromptTokens: number }
}

// Standard pricing tier for Sonnet models: $3 input / $15 output per Mtok
export const COST_TIER_3_15 = {
  inputTokens: 3,
  outputTokens: 15,
  promptCacheWriteTokens: 3.75,
  promptCacheReadTokens: 0.3,
  webSearchRequests: 0.01,
} as const satisfies ModelCosts

// Pricing tier for Opus 4/4.1: $15 input / $75 output per Mtok
export const COST_TIER_15_75 = {
  inputTokens: 15,
  outputTokens: 75,
  promptCacheWriteTokens: 18.75,
  promptCacheReadTokens: 1.5,
  webSearchRequests: 0.01,
} as const satisfies ModelCosts

// Pricing tier for Opus 4.5: $5 input / $25 output per Mtok
export const COST_TIER_5_25 = {
  inputTokens: 5,
  outputTokens: 25,
  promptCacheWriteTokens: 6.25,
  promptCacheReadTokens: 0.5,
  webSearchRequests: 0.01,
} as const satisfies ModelCosts

// Fast mode pricing for Opus 4.6: $30 input / $150 output per Mtok
export const COST_TIER_30_150 = {
  inputTokens: 30,
  outputTokens: 150,
  promptCacheWriteTokens: 37.5,
  promptCacheReadTokens: 3,
  webSearchRequests: 0.01,
} as const satisfies ModelCosts

// Pricing for Haiku 3.5: $0.80 input / $4 output per Mtok
export const COST_HAIKU_35 = {
  inputTokens: 0.8,
  outputTokens: 4,
  promptCacheWriteTokens: 1,
  promptCacheReadTokens: 0.08,
  webSearchRequests: 0.01,
} as const satisfies ModelCosts

// Pricing for Haiku 4.5: $1 input / $5 output per Mtok
export const COST_HAIKU_45 = {
  inputTokens: 1,
  outputTokens: 5,
  promptCacheWriteTokens: 1.25,
  promptCacheReadTokens: 0.1,
  webSearchRequests: 0.01,
} as const satisfies ModelCosts

const DEFAULT_UNKNOWN_MODEL_COST = COST_TIER_5_25

/**
 * Get the cost tier for Opus 4.6 based on fast mode.
 */
export function getOpus46CostTier(fastMode: boolean): ModelCosts {
  if (isFastModeEnabled() && fastMode) {
    return COST_TIER_30_150
  }
  return COST_TIER_5_25
}

// @[MODEL LAUNCH]: Add a pricing entry for the new model below.
// Costs from https://platform.claude.com/docs/en/about-claude/pricing
// Web search cost: $10 per 1000 requests = $0.01 per request
type CatalogPricing = {
  input: number; output: number; cache_write_5m?: number; cache_write_1h?: number
  cache_read?: number; web_search?: number
  long_prompt?: Omit<CatalogPricing, 'long_prompt'> & { above_prompt_tokens: number }
}

function catalogCosts(id: string, pricing: CatalogPricing): ModelCosts {
  if (pricing.cache_write_5m === undefined || pricing.cache_read === undefined || pricing.web_search === undefined) {
    throw new Error(`Model catalog ${id} has incomplete pricing`)
  }
  return {
    inputTokens: pricing.input, outputTokens: pricing.output,
    promptCacheWriteTokens: pricing.cache_write_5m,
    promptCacheReadTokens: pricing.cache_read, webSearchRequests: pricing.web_search,
    ...(pricing.cache_write_1h !== undefined && { promptCacheWrite1hTokens: pricing.cache_write_1h }),
    ...(pricing.long_prompt !== undefined && { longPrompt: {
      abovePromptTokens: pricing.long_prompt.above_prompt_tokens,
      ...catalogCosts(id, { ...pricing.long_prompt, web_search: pricing.web_search }),
    } }),
  }
}

// No model.ts calls during initialization: that module also imports cost display.
export const MODEL_COSTS: Record<ModelShortName, ModelCosts> = Object.fromEntries(
  MODEL_CATALOG.models.map(entry => {
    const tiers: Record<string, CatalogPricing> = MODEL_CATALOG.pricing_tiers
    const pricing = typeof entry.pricing === 'string' ? tiers[entry.pricing] : entry.pricing
    if (!pricing) throw new Error(`Model catalog ${entry.id} missing pricing`)
    return [entry.id, catalogCosts(entry.id, pricing)]
  }),
)

/**
 * Calculates the USD cost based on token usage and model cost configuration
 */
function tokensToUSDCost(modelCosts: ModelCosts, usage: Usage): number {
  const input = usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
  const costs = modelCosts.longPrompt && input > modelCosts.longPrompt.abovePromptTokens ? modelCosts.longPrompt : modelCosts
  const cached = usage.cache_creation_input_tokens ?? 0
  const oneHour = Math.min(cached, Math.max(0, usage.cache_creation?.ephemeral_1h_input_tokens ?? 0))
  const writeCost = costs.promptCacheWrite1hTokens !== undefined && oneHour > 0
    ? oneHour / 1_000_000 * costs.promptCacheWrite1hTokens + (cached - oneHour) / 1_000_000 * costs.promptCacheWriteTokens
    : cached / 1_000_000 * costs.promptCacheWriteTokens
  const tokens = usage.input_tokens / 1_000_000 * costs.inputTokens +
    usage.output_tokens / 1_000_000 * costs.outputTokens +
    (usage.cache_read_input_tokens ?? 0) / 1_000_000 * costs.promptCacheReadTokens + writeCost
  return tokens * (usage.inference_geo === 'us' ? 1.1 : 1) +
    (usage.server_tool_use?.web_search_requests ?? 0) * costs.webSearchRequests
}

export function getModelCosts(model: string, usage: Usage): ModelCosts {
  const shortName = getCanonicalName(model)

  if (usage.speed === 'fast') {
    const fastPrice = shortName === 'claude-opus-5-5' ? [8, 40, 10, 16, 0.4]
      : ['claude-opus-4-8', 'claude-opus-5'].includes(shortName) ? [10, 50, 12.5, 20, 1]
      : ['claude-opus-4-6', 'claude-opus-4-7'].includes(shortName) ? [30, 150, 37.5, 60, 3] : undefined
    if (fastPrice) return { inputTokens: fastPrice[0]!, outputTokens: fastPrice[1]!, promptCacheWriteTokens: fastPrice[2]!, promptCacheWrite1hTokens: fastPrice[3]!, promptCacheReadTokens: fastPrice[4]!, webSearchRequests: 0.01 }
  }

  // Standard catalog prices apply when the response did not use fast mode.
  if (
    shortName === 'claude-opus-4-6'
  ) {
    const isFastMode = usage.speed === 'fast'
    return isFastMode ? COST_TIER_30_150 : MODEL_COSTS[shortName]!
  }

  const costs = MODEL_COSTS[shortName]
  if (!costs) {
    trackUnknownModelCost(model, shortName)
    return (
      MODEL_COSTS[getCanonicalName(getDefaultMainLoopModelSetting())] ??
      DEFAULT_UNKNOWN_MODEL_COST
    )
  }
  return costs
}

function trackUnknownModelCost(model: string, shortName: ModelShortName): void {
  logEvent('tengu_unknown_model_cost', {
    model: model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    shortName:
      shortName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  setHasUnknownModelCost()
}

// Calculate the cost of a query in US dollars.
// If the model's costs are not found, use the default model's costs.
export function calculateUSDCost(resolvedModel: string, usage: Usage): number {
  const modelCosts = getModelCosts(resolvedModel, usage)
  return tokensToUSDCost(modelCosts, usage)
}

/**
 * Calculate cost from raw token counts without requiring a full BetaUsage object.
 * Useful for side queries (e.g. classifier) that track token counts independently.
 */
export function calculateCostFromTokens(
  model: string,
  tokens: {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens: number
    cacheCreationInputTokens: number
  },
): number {
  const usage: Usage = {
    input_tokens: tokens.inputTokens,
    output_tokens: tokens.outputTokens,
    cache_read_input_tokens: tokens.cacheReadInputTokens,
    cache_creation_input_tokens: tokens.cacheCreationInputTokens,
  } as Usage
  return calculateUSDCost(model, usage)
}

function formatPrice(price: number): string {
  // Format price: integers without decimals, others with 2 decimal places
  // e.g., 3 -> "$3", 0.8 -> "$0.80", 22.5 -> "$22.50"
  if (Number.isInteger(price)) {
    return `$${price}`
  }
  return `$${price.toFixed(2)}`
}

/**
 * Format model costs as a pricing string for display
 * e.g., "$3/$15 per Mtok"
 */
export function formatModelPricing(costs: ModelCosts): string {
  return `${formatPrice(costs.inputTokens)}/${formatPrice(costs.outputTokens)} per Mtok`
}

/**
 * Get formatted pricing string for a model
 * Accepts either a short name or full model name
 * Returns undefined if model is not found
 */
export function getModelPricingString(model: string): string | undefined {
  const shortName = getCanonicalName(model)
  const costs = MODEL_COSTS[shortName]
  if (!costs) return undefined
  return formatModelPricing(costs)
}
