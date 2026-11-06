/**
 * OpenTelemetry-compatible event entrypoint, now backed exclusively by the
 * bounded on-disk diagnostics journal. The input may include prompts, paths,
 * account IDs or tool output; no string values are stored.
 */
import { recordLocalEvent } from '../../services/analytics/localDiagnostics.js'

let eventSequence = 0
const NUMERIC_FIELD = /(?:^|[_.])(?:duration|elapsed|latency|count|total|tokens?|bytes?|size|retries|retry|attempts?|status|time|ms)(?:$|[_.])/i

/** Logging call sites use this value only as diagnostic input. */
export function redactIfDisabled(_content: string): string {
  return '<REDACTED>'
}

export async function logOTelEvent(
  eventName: string,
  metadata: Record<string, string | undefined> = {},
): Promise<void> {
  if (process.env.NODE_ENV === 'test') return

  const safe: Record<string, number | boolean> = {
    sequence: eventSequence++,
  }
  for (const [key, value] of Object.entries(metadata)) {
    if (!NUMERIC_FIELD.test(key) || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(key)) continue
    if (value === undefined || value.length > 32 || !/^-?(?:\d+)(?:\.\d+)?$/.test(value)) continue
    const number = Number(value)
    if (Number.isFinite(number)) safe[key] = number
  }
  await recordLocalEvent(`otel_${eventName}`, safe)
}
