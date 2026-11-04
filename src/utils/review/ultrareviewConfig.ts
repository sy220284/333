/**
 * Claude Code 2.1.317 ultrareview environment and client deadline contract.
 * Source: official chunk-ttn3wae7.js (EPe, nci, vAt) and
 * chunk-wvbedp11.js (yUr review launch).
 *
 * The same contract is used by the interactive command, standalone CLI and
 * RemoteAgentTask. Keep this module pure for exact input/output regression.
 */
function positiveInt(value, fallback, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const n = Math.floor(value)
  if (n <= 0 || n > maximum) return fallback
  return n
}

export function getUltrareviewClientWaitMinutes(config) : number {
  const value = config?.client_wait_minutes
  return typeof value === 'number' && Number.isFinite(value) &&
    value >= 30 && value <= 55 ? Math.floor(value) : 45
}

export function buildUltrareviewEnvironment(config, devBundle = process.env.BUGHUNTER_DEV_BUNDLE_B64) : { BUGHUNTER_DEV_BUNDLE_B64: string; BUGHUNTER_MODEL: string; BUGHUNTER_FLEET_SIZE: string; BUGHUNTER_MAX_DURATION: string; BUGHUNTER_AGENT_TIMEOUT: string; BUGHUNTER_TOTAL_WALLCLOCK: string; BUGHUNTER_RESULT_RELAY_MAX_SEC: string; BUGHUNTER_CODE_QUALITY: string; BUGHUNTER_DRY_RUN: string; AUTOPATCH_ENABLE_ASIMOV: string; } {
  const waitMinutes = getUltrareviewClientWaitMinutes(config)
  const model = config?.model
  return {
    BUGHUNTER_DRY_RUN: '1',
    AUTOPATCH_ENABLE_ASIMOV: '1',
    ...(config?.code_quality !== false && { BUGHUNTER_CODE_QUALITY: '1' }),
    BUGHUNTER_FLEET_SIZE: String(positiveInt(config?.fleet_size, 5, 20)),
    BUGHUNTER_MAX_DURATION: String(positiveInt(config?.max_duration_minutes, 10, 25)),
    BUGHUNTER_AGENT_TIMEOUT: String(positiveInt(config?.agent_timeout_seconds, 600, 1800)),
    BUGHUNTER_TOTAL_WALLCLOCK: String(positiveInt(config?.total_wallclock_minutes, 22, 27)),
    BUGHUNTER_RESULT_RELAY_MAX_SEC: String((waitMinutes - 3) * 60),
    ...(typeof model === 'string' && model.length > 0 && { BUGHUNTER_MODEL: model }),
    ...(devBundle && { BUGHUNTER_DEV_BUNDLE_B64: devBundle }),
  }
}
