/**
 * 2.1.310 F080: lower-trust project and local settings may disable
 * telemetry but must not enable exports, redirect collectors or capture
 * prompts, tool content and raw API bodies.
 *
 * Only apply elevated values when they originate from a user/CLI/managed
 * source. Keeping this pure makes the trust boundary testable without a
 * telemetry exporter or network.
 */
const truthy = v => ['true','1','yes','on'].includes(String(v).trim().toLowerCase())

/**
 * The target 2.1.310 runtime trace gate is explicit opt-in only.
 * Either trusted environment variable can enable it; no test/internal
 * build flag and no automatic usage-based rollout changes that result.
 */
export function isEnhancedTracingOptedIn(env) {
  const value = env.CLAUDE_CODE_ENHANCED_TELEMETRY_BETA ??
    env.ENABLE_ENHANCED_TELEMETRY_BETA
  return truthy(value)
}

export function isPrivilegedTelemetrySetting(name, value) {
  const key = name.toUpperCase()
  if (key === 'CLAUDE_CODE_ENABLE_TELEMETRY' ||
      key === 'CLAUDE_CODE_ENHANCED_TELEMETRY_BETA' ||
      key === 'ENABLE_ENHANCED_TELEMETRY_BETA' ||
      key === 'CLAUDE_CODE_ENABLE_BETA_TRACING') return truthy(value)

  // Detailed tracing can export complete prompts and tool data through its
  // own endpoint even when ordinary OpenTelemetry export is disabled.
  if (key === 'ENABLE_BETA_TRACING_DETAILED') return truthy(value)
  if (key === 'BETA_TRACING_ENDPOINT') return Boolean(String(value).trim())

  if (key === 'OTEL_RESOURCE_ATTRIBUTES' ||
      key === 'OTEL_SERVICE_NAME' ||
      key === 'OTEL_LOG_RAW_API_BODIES') return Boolean(String(value).trim()) && !['false','off','none','0'].includes(String(value).trim().toLowerCase())

  if (key.startsWith('OTEL_EXPORTER_')) return Boolean(String(value).trim())
  if (/^OTEL_(?:TRACES|LOGS|METRICS)_EXPORTER$/.test(key)) {
    return Boolean(String(value).trim()) && String(value).trim().toLowerCase() !== 'none'
  }

  if (/^OTEL_LOG_(?:USER_PROMPTS|TOOL_CONTENT|TOOL_DETAILS|MANAGED_SETTINGS)$/.test(key)) return truthy(value)
  if (key.startsWith('OTEL_METRICS_INCLUDE_')) return truthy(value)
  return false
}

/**
 * A merged env value that would increase telemetry privileges is taken from
 * trusted sources only; when none authorize it, it is removed from the
 * merged settings. Existing process-spawn env is not touched. Lower-trust
 * settings are still allowed to *disable* exports and content capture.
 */
export function resolveProjectTelemetryEnv(mergedEnv, trustedEnv) {
  const result = { ...mergedEnv }
  for (const [key, value] of Object.entries(result)) {
    if (!isPrivilegedTelemetrySetting(key, value)) continue
    const trustedEntry = Object.entries(trustedEnv)
      .find(([candidate]) => candidate.toUpperCase() === key.toUpperCase())
    if (trustedEntry) result[key] = trustedEntry[1]
    else delete result[key]
  }
  return result
}
