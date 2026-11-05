/**
 * Claude Code 2.1.310 wire fields that the pinned public SDK 0.52.0 does
 * not yet describe. Keep declarations anchored to observed runtime fields;
 * no runtime shim or fake implementation is introduced here.
 */
import type { BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

declare module '@anthropic-ai/sdk/resources/beta/messages/messages.mjs' {
  interface BetaUsage {
    speed?: 'standard' | 'fast' | null
    iterations?: Array<{ type: string; input_tokens: number; output_tokens: number }> | null
    inference_geo?: string | null
  }

  interface BetaMessageDeltaUsage {
    iterations?: Array<{ type: string; input_tokens: number; output_tokens: number }> | null
  }

  interface BetaServerToolUsage {
    web_fetch_requests?: number
  }

  interface BetaOutputConfig {
    effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    format?: BetaJSONOutputFormat
  }

  interface BetaJSONOutputFormat {
    type: 'json_schema'
    schema: Record<string, unknown>
  }

  type BetaRequestDocumentBlock = Extract<BetaContentBlockParam, { type: 'document' }>
}
