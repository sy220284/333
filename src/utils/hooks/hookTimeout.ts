/** Configured hook.timeout is in seconds. Clamp to at least one second. */
export function resolveHookTimeoutMs(configuredSeconds, fallbackMs) {
  if (configuredSeconds === undefined || configuredSeconds === null) {
    return Math.max(1000, fallbackMs)
  }
  if (typeof configuredSeconds !== 'number' ||
      !Number.isFinite(configuredSeconds) || configuredSeconds < 0) {
    throw new RangeError('Hook timeout must be a non-negative number of seconds')
  }
  return Math.max(1000, configuredSeconds * 1000)
}
