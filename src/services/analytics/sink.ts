/** Unified local diagnostics sink; vendor analytics network exports removed. */
import { attachAnalyticsSink } from './index.js'
import { recordLocalEvent } from './localDiagnostics.js'
type Metadata = Record<string, boolean | number | undefined>
function logEventLocally(name: string, metadata: Metadata): void {
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
