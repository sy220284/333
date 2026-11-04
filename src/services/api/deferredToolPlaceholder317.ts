import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

/**
 * Claude Code 2.1.317 reserves a single permanently deferred tool schema.
 * It is an API-level declaration, not an executable tool in the permission
 * layer. The wire contract comes from the official 317
 * chunk-p45bqywj.js and the schema insertion in chunk-thp9mgjc.js.
 */
export const DEFERRED_TOOL_PLACEHOLDER_NAME = 'DeferredToolPlaceholder'

export function addDeferredToolPlaceholder317(
  schemas: BetaToolUnion[],
  enabled: boolean,
): void {
  if (!enabled || schemas.some(schema => schema.name === DEFERRED_TOOL_PLACEHOLDER_NAME)) {
    return
  }
  // Keep the last actual tool's cache boundary in the same position as
  // the upstream 317 request builder (insertion before the final schema).
  schemas.splice(Math.max(0, schemas.length - 1), 0, {
    name: DEFERRED_TOOL_PLACEHOLDER_NAME,
    description: 'Reserved placeholder that keeps deferred tool loading active; never call this tool.',
    input_schema: { type: 'object', properties: {} },
    defer_loading: true,
  } as BetaToolUnion)
}
