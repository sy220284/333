/**
 * Local-only telemetry runtime. Model traffic and optional remote sessions
 * remain separate; diagnostics never open a network connection.
 */
import type { Meter } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { setMeterProvider } from '../../bootstrap/state.js'
import {
  flushLocalDiagnostics,
  isLocalDiagnosticsEnabled,
} from '../../services/analytics/localDiagnostics.js'
import { registerCleanup } from '../cleanupRegistry.js'
import { profileCheckpoint } from '../startupProfiler.js'
import { LocalMetricsExporter } from './localMetricsExporter.js'
import { initializePerfettoTracing } from './perfettoTracing.js'

const LOCAL_METRIC_INTERVAL_MS = 60_000
let provider: MeterProvider | null = null

export function isTelemetryEnabled(): boolean {
  return isLocalDiagnosticsEnabled()
}

export async function initializeTelemetry(): Promise<Meter> {
  profileCheckpoint('telemetry_init_start')
  initializePerfettoTracing()
  if (!provider) {
    const readers = isLocalDiagnosticsEnabled()
      ? [
          new PeriodicExportingMetricReader({
            exporter: new LocalMetricsExporter(),
            exportIntervalMillis: LOCAL_METRIC_INTERVAL_MS,
          }),
        ]
      : []
    provider = new MeterProvider({
      resource: resourceFromAttributes({
        'service.name': 'local-cli',
        'service.version': MACRO.VERSION,
      }),
      readers,
    })
    setMeterProvider(provider)
    registerCleanup(async () => {
      await provider?.shutdown()
      await flushLocalDiagnostics()
    })
  }
  return provider.getMeter('local-cli', MACRO.VERSION)
}

export async function flushTelemetry(): Promise<void> {
  if (provider) await provider.forceFlush()
  await flushLocalDiagnostics()
}
