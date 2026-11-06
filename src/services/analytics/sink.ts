/** The sole analytics sink: bounded private on-disk diagnostic events. */
import { attachAnalyticsSink } from './index.js'
import { isLocalDiagnosticsEnabled, recordLocalEvent } from './localDiagnostics.js'
type Metadata = Record<string, boolean | number | undefined>
const eventCounts = new Map<string, number>()
const MAX_EVENT_TYPES = 128

export function getLocalDiagnosticEventCounts(): Record<string, number> {
  return Object.fromEntries(eventCounts)
}

async function persistEvent(name: string, metadata: Metadata): Promise<void> {
  if (!isLocalDiagnosticsEnabled()) return
  if (/^[a-z][a-z0-9_]{0,96}$/.test(name) && (eventCounts.has(name) || eventCounts.size < MAX_EVENT_TYPES)) {
    eventCounts.set(name, (eventCounts.get(name) ?? 0) + 1)
  }
  await recordLocalEvent(name, metadata)
}

export function initializeAnalyticsGates(): void {
  // All event routing is local and governed by the privacy level.
}

export function initializeAnalyticsSink(): void {
  attachAnalyticsSink({
    logEvent: (name: string, metadata: Metadata) => {
      void persistEvent(name, metadata).catch(error => {
        process.stderr.write(`[local diagnostics] ${String(error)}\n`)
      })
    },
    logEventAsync: persistEvent,
  })
}
