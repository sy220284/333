import type { SessionId } from '../types/ids.js'

/** Capture the session identity once at the conversation boundary.
 * A later global bootstrap/session switch must not relabel in-flight SDK
 * events or subagent calls from an already running conversation.
 */
export function bindSessionId(
  explicitId: SessionId | undefined,
  currentSessionId: () => SessionId,
): SessionId {
  const id = explicitId ?? currentSessionId()
  if (typeof id !== 'string' || id.length === 0) {
    throw new TypeError('Query session identity must be a non-empty string')
  }
  return id
}
