import type { SessionId } from '../types/ids.js'
export function bindSessionId(
  explicitId: SessionId | undefined,
  currentSessionId: () => SessionId,
): SessionId
