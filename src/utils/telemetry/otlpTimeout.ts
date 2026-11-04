/**
 * The 2.1.317 OTLP exporter boundary: ten seconds by default, capped at thirty.
 * OTel uses milliseconds for OTEL_EXPORTER_OTLP_TIMEOUT.
 */
export function resolveOTLPTimeoutMs(raw) {
  if (raw === undefined || raw === '') return 10000
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw new RangeError('OTEL_EXPORTER_OTLP_TIMEOUT must be a positive integer in milliseconds')
  }
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError('OTEL_EXPORTER_OTLP_TIMEOUT must be a positive safe integer in milliseconds')
  }
  return Math.min(value, 30000)
}
