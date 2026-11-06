/**
 * Detailed vendor tracing and its remote content collector have been removed.
 * Local diagnostics use metadata-only events, while user-enabled Perfetto
 * traces remain available separately on disk.
 */
import type { Span } from '@opentelemetry/api'
import type { AssistantMessage, UserMessage } from '../../types/message.js'

export interface LLMRequestNewContext {
  systemPrompt?: string
  querySource?: string
  tools?: string
}

export function isBetaTracingEnabled(): boolean {
  return false
}

export function clearBetaTracingState(): void {
  // No remote tracing state is retained.
}

/** Existing local trace utility; it never uploads or persists content itself. */
export function truncateContent(
  content: string,
  maxSize = 60 * 1024,
): { content: string; truncated: boolean } {
  if (content.length <= maxSize) return { content, truncated: false }
  return { content: `${content.slice(0, maxSize)}\n\n[TRUNCATED]`, truncated: true }
}

export function addBetaInteractionAttributes(_span: Span, _userPrompt: string): void {}
export function addBetaLLMRequestAttributes(
  _span: Span,
  _newContext?: LLMRequestNewContext,
  _messagesForAPI?: (UserMessage | AssistantMessage)[],
): void {}
export function addBetaLLMResponseAttributes(
  _attributes: Record<string, string | number | boolean>,
  _metadata?: { modelOutput?: string; thinkingOutput?: string },
): void {}
export function addBetaToolInputAttributes(_span: Span, _toolName: string, _toolInput: string): void {}
export function addBetaToolResultAttributes(
  _attributes: Record<string, string | number | boolean>,
  _toolName: string | number | boolean,
  _toolResult: string,
): void {}
