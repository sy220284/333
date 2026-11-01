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
  // A lower-trust project must not undo a user/managed decision to disable
  // collection or nonessential network traffic. False is the privileged
  // direction for these inverse switches.
  if (key === 'DISABLE_TELEMETRY' ||
      key === 'DO_NOT_TRACK' ||
      key === 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC' ||
      key === 'DISABLE_ERROR_REPORTING') {
    return !truthy(value)
  }
  if (key === 'CLAUDE_CODE_ENABLE_TELEMETRY' ||
      key === 'CLAUDE_CODE_ENHANCED_TELEMETRY_BETA' ||
      key === 'ENABLE_ENHANCED_TELEMETRY_BETA' ||
      key === 'CLAUDE_CODE_ENABLE_BETA_TRACING') return truthy(value)

  // Detailed tracing can export complete prompts and tool data through its
  // own endpoint even when ordinary OpenTelemetry export is disabled.
  if (key === 'CLAUDE_CODE_PERFETTO_TRACE') {
    const normalized=String(value).trim().toLowerCase()
    return Boolean(normalized) && !['off','false','0','no'].includes(normalized)
  }
  if (key === 'CLAUDE_CODE_PERFETTO_WRITE_INTERVAL_S')
    return Number(value)>0
  if (key === 'ENABLE_BETA_TRACING_DETAILED') return truthy(value)
  if (key === 'BETA_TRACING_ENDPOINT') return Boolean(String(value).trim())

  if (key === 'OTEL_RESOURCE_ATTRIBUTES' ||
      key === 'OTEL_SERVICE_NAME' ||
      key === 'OTEL_LOG_RAW_API_BODIES') return Boolean(String(value).trim()) && !['false','off','none','0'].includes(String(value).trim().toLowerCase())

  // 2.1.310 source: chunk-5rw2zfa0.js:1308-1310 and
  // chunk-h2tyaevk.js:258. These export and content-capture variables
  // also cross the project-settings trust boundary.
  if (key === 'OTEL_LOG_ASSISTANT_RESPONSES') return truthy(value)
  if (key === 'OTEL_EXPORTER_PROMETHEUS_HOST' ||
      key === 'OTEL_EXPORTER_PROMETHEUS_PORT')
    return Boolean(String(value).trim())
  if (key.startsWith('ANT_OTEL_'))
    return Boolean(String(value).trim()) &&
      String(value).trim().toLowerCase() !== 'none'
  if (key === 'OTEL_TRACES_SAMPLER')
    return Boolean(String(value).trim()) &&
      String(value).trim().toLowerCase() !== 'always_off'
  if (key === 'OTEL_TRACES_SAMPLER_ARG')
    return Boolean(String(value).trim())

  if (key.startsWith('OTEL_EXPORTER_')) return Boolean(String(value).trim())
  if (/^OTEL_(?:TRACES|LOGS|METRICS)_EXPORTER$/.test(key)) {
    return Boolean(String(value).trim()) && String(value).trim().toLowerCase() !== 'none'
  }

  if (/^OTEL_LOG_(?:USER_PROMPTS|TOOL_CONTENT|TOOL_DETAILS|MANAGED_SETTINGS)$/.test(key)) return truthy(value)
  if (key.startsWith('OTEL_METRICS_INCLUDE_')) return truthy(value)

  // 2.1.310 contains additional OpenTelemetry knobs for trace limits,
  // export batching and periodic delivery. Keeping an allowlist of only
  // today's sensitive names makes a newly added exporter/config option
  // editable from an untrusted project tomorrow. Require a trusted source
  // for every other OTEL_* setting. The explicit reductions above (such as
  // an exporter set to "none") remain allowed.
  if (key.startsWith('OTEL_')) return true
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
    const upper = key.toUpperCase()
    const privileged = isPrivilegedTelemetrySetting(key, value)
    // Target 2.1.310's project-scoped safe reductions are accepted only
    // when no trusted setting supplies the same key (Jsr in
    // chunk-h2tyaevk.js). A project setting "none" must never silently
    // override an administrator's explicit exporter choice.
    const controlled = upper.startsWith('OTEL_') ||
      upper.startsWith('ANT_OTEL_') ||
      upper === 'CLAUDE_CODE_ENABLE_TELEMETRY' ||
      upper === 'CLAUDE_CODE_ENHANCED_TELEMETRY_BETA' ||
      upper === 'ENABLE_ENHANCED_TELEMETRY_BETA' ||
      upper === 'CLAUDE_CODE_ENABLE_BETA_TRACING' ||
      upper === 'ENABLE_BETA_TRACING_DETAILED' ||
      upper === 'BETA_TRACING_ENDPOINT' ||
      upper.startsWith('CLAUDE_CODE_PERFETTO_')
    if (!controlled && !privileged) continue
    const trustedEntry = Object.entries(trustedEnv)
      .find(([candidate]) => candidate.toUpperCase() === upper)
    if (trustedEntry) {
      result[key] = trustedEntry[1]
    } else if (privileged) {
      delete result[key]
    }
  }
  return result
}
