/** Local diagnostic counters use no user, device, account or session identifiers. */
import type { Attributes } from '@opentelemetry/api'

export function getTelemetryAttributes(): Attributes {
  return {}
}
