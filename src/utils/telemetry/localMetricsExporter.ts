/**
 * Local metric exporter. No network access and no account, session, host,
 * workspace or user-defined attribute values are persisted.
 */
import { ExportResultCode, type ExportResult } from '@opentelemetry/core'
import {
  AggregationTemporality,
  type PushMetricExporter,
  type ResourceMetrics,
} from '@opentelemetry/sdk-metrics'
import { recordLocalEvent } from '../../services/analytics/localDiagnostics.js'

export function localMetricName(name: string): string | null {
  const normalized = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 85)
  return /^[a-z][a-z0-9_]*$/.test(normalized) ? `metric_${normalized}` : null
}

function localMetricValues(value: unknown): Record<string, number> | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { value }
  }
  if (value && typeof value === 'object') {
    const summary = value as { sum?: unknown; count?: unknown }
    const output: Record<string, number> = {}
    if (typeof summary.count === 'number' && Number.isFinite(summary.count)) {
      output.count = summary.count
    }
    if (typeof summary.sum === 'number' && Number.isFinite(summary.sum)) {
      output.sum = summary.sum
    }
    return Object.keys(output).length > 0 ? output : null
  }
  return null
}

export class LocalMetricsExporter implements PushMetricExporter {
  async export(
    metrics: ResourceMetrics,
    callback: (result: ExportResult) => void,
  ): Promise<void> {
    try {
      for (const scope of metrics.scopeMetrics) {
        for (const metric of scope.metrics) {
          const name = localMetricName(metric.descriptor.name)
          if (!name) continue
          for (const point of metric.dataPoints) {
            const values = localMetricValues(point.value)
            if (values) await recordLocalEvent(name, values)
          }
        }
      }
      callback({ code: ExportResultCode.SUCCESS })
    } catch (error) {
      callback({
        code: ExportResultCode.FAILED,
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }

  async forceFlush(): Promise<void> {}
  async shutdown(): Promise<void> {}
  selectAggregationTemporality(): AggregationTemporality {
    return AggregationTemporality.DELTA
  }
}
