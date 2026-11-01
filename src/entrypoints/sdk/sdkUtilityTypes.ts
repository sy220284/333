import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

/**
 * Usage fields remain present and non-null after normalisation by the API
 * accounting layer. Derive each member from the SDK's actual schema rather
 * than maintaining a separate, drifting list of counter fields.
 *
 * Origin: coreSchemas.ts explicitly documents this as a mapped type over Usage;
 * services/api/emptyUsage.ts supplies every normalised field at runtime.
 * cache_deleted_input_tokens is intentionally excluded from this public type.
 */
export type NonNullableUsage = {
  [K in keyof BetaUsage]-?: NonNullable<BetaUsage[K]>
}
