/** Unified local diagnostics sink; vendor analytics network exports removed. */
import { attachAnalyticsSink } from './index.js'
import { recordLocalEvent } from './localDiagnostics.js'
type Metadata = Record<string, boolean | number | undefined>
const eventCounts = new Map<string, number>()
const MAX_EVENT_TYPES = 128
export function getLocalDiagnosticEventCounts(): Record<string, number> {
  return Object.fromEntries(eventCounts)
}
function logEventLocally(name: string, metadata: Metadata): void {
  if (/^[a-z][a-z0-9_]{0,96}$/.test(name) && (eventCounts.has(name) || eventCounts.size < MAX_EVENT_TYPES)) {
    eventCounts.set(name, (eventCounts.get(name) ?? 0) + 1)
  }
  void recordLocalEvent(name, metadata).catch(error => {
    // Disk errors remain visible without terminating model requests.
    process.stderr.write(`[333 local diagnostics] ${String(error)}\n`)
  })
}
export function initializeAnalyticsGates(): void {
  // Vendor analytics feature gates no longer control diagnostic routing.
}
export function initializeAnalyticsSink(): void {
  attachAnalyticsSink({
    logEvent: logEventLocally,
    logEventAsync: (name: string, metadata: Metadata) => recordLocalEvent(name, metadata),
  })
}
