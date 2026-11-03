/**
 * Current CCR v2 remote-session API identifiers.
 * Worker endpoints use cse_* identifiers, while session-management APIs
 * and claude.ai URLs use session_* identifiers for the same UUID.
 * Conversion is always applied at these API boundaries.
 */
export function toSessionApiId(id: string): string {
  return id.startsWith('cse_') ? `session_${id.slice(4)}` : id
}

export function toWorkerApiId(id: string): string {
  return id.startsWith('session_') ? `cse_${id.slice(8)}` : id
}
