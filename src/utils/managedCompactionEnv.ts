/**
 * Claude Code 2.1.317: settings.env (including a mod's env overrides) may
 * disable compaction but may not re-enable it. A startup/managed DISABLE_COMPACT
 * must not be undone by a lower-priority false-like settings value.
 * Preserve every unrelated key for the existing host/provider filters.
 */
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

export function filterSettingsCompactionEnv(env: Record<string, string | undefined> | undefined): Record<string, string | undefined> {
  if (!env) return {}
  const filtered: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(env)) {
    if (
      key.toUpperCase() === 'DISABLE_COMPACT' &&
      (typeof value !== 'string' || !TRUE_VALUES.has(value.trim().toLowerCase()))
    ) continue
    filtered[key] = value
  }
  return filtered
}
