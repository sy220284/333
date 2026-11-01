import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

type NormalizedSDKUsage = {
  [K in keyof BetaUsage]-?: NonNullable<BetaUsage[K]>
}

/** The runtime API exposes these fields beyond the published SDK declaration. */
type UsageIteration = {
  type: string
  input_tokens: number
  output_tokens: number
}

/**
 * Normalized accounting counters. The extra fields and web-fetch usage are
 * verified in services/api/emptyUsage.ts and updateUsage()/accumulateUsage().
 * Keep cache_deleted_input_tokens outside the release-visible contract.
 */
export type NonNullableUsage = Omit<NormalizedSDKUsage, 'server_tool_use'> & {
  server_tool_use: NormalizedSDKUsage['server_tool_use'] & {
    web_fetch_requests: number
  }
  inference_geo: string
  iterations: UsageIteration[]
  speed: 'standard' | 'fast'
}
