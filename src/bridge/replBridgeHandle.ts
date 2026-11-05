import { updateSessionBridgeId } from '../utils/concurrentSessions.js'
import type { ReplBridgeHandle } from './replBridge.js'
import { toSessionApiId } from './sessionIdProtocol.js'

/**
 * Global pointer to the active REPL bridge handle, so callers outside
 * useReplBridge's React tree (tools, slash commands) can invoke handle methods
 * like subscribePR. Same one-bridge-per-process justification as bridgeDebug.ts
 * — the handle's closure captures the sessionId and getAccessToken that created
 * the session, and re-deriving those independently (BriefTool/upload.ts pattern)
 * risks staging/prod token divergence.
 *
 * Set from useReplBridge.tsx when init completes; cleared on teardown.
 */

let handle: ReplBridgeHandle | null = null
let outboundOnly = false

// The CCR mirror can upload session events but cannot receive peer traffic.
// Keep that capability alongside the one process-wide bridge handle so
// message tools and the deferred-tool picker apply the same live gate.
export function isReplBridgeActive(): boolean {
  return handle !== null && !outboundOnly
}

export function setReplBridgeHandle(
  h: ReplBridgeHandle | null,
  isOutboundOnly: boolean,
): void {
  handle = h
  outboundOnly = isOutboundOnly
  // Publish (or clear) our bridge session ID in the session record so other
  // local peers can dedup us out of their bridge list — local is preferred.
  void updateSessionBridgeId(getSelfBridgeSessionId() ?? null).catch(() => {})
}

export function getReplBridgeHandle(): ReplBridgeHandle | null {
  return handle
}

/**
 * Our own bridge session ID in the session_* compat format the API returns
 * in /v1/sessions responses — or undefined if bridge isn't connected.
 */
export function getSelfBridgeSessionId(): string | undefined {
  const h = getReplBridgeHandle()
  return h ? toSessionApiId(h.bridgeSessionId) : undefined
}
