import { getIndependentProfile } from '../services/api/multimodel/profiles.js'
// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { getSettingsForSource } from './settings/settings.js'
import { getEnabledSettingSources } from './settings/constants.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import { getAPIProvider } from './model/providers.js'
import { get3PModelCapabilityOverride } from './model/modelSupportOverrides.js'
import { isEnvTruthy } from './envUtils.js'
import { getModelBehavior317 } from './model/modelBehavior317.js'
import { getCatalogModel, getModelCapabilityEnvOverride } from './model/modelCatalog.js'
import { getModelCapability } from './model/modelCapabilities.js'
import { buildEffortSettingsTable, lookupSettingsEffort } from './effortSettings.js'
import type { EffortLevel } from 'src/entrypoints/sdk/runtimeTypes.js'

export type { EffortLevel }

export const EFFORT_LEVELS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const satisfies readonly EffortLevel[]

export type EffortValue = EffortLevel | number

type EffortPolicy = {
  maxEffortLevel?: EffortLevel
  modelSettings?: Record<string, { maxEffortLevel?: EffortLevel; effortLevel?: EffortLevel }>
}

// 317 le: each layer's per-model cap supersedes its top-level cap;
// the most restrictive applicable layer wins across sources.
export function resolveEffortCap(model: string, layers: readonly EffortPolicy[]): EffortLevel | null {
  const identity = (value: string) => getCatalogModel(value)?.id ?? value.toLowerCase().replace(/\[1m\]$/i, '')
  const name = identity(model)
  let cap: EffortLevel | null = null
  for (const layer of layers) {
    let own: EffortLevel | undefined
    for (const [key, policy] of Object.entries(layer.modelSettings ?? {})) {
      const value = policy.maxEffortLevel
      if (value !== undefined && identity(key) === name && (own === undefined || EFFORT_LEVELS.indexOf(value) < EFFORT_LEVELS.indexOf(own))) own = value
    }
    own ??= layer.maxEffortLevel
    if (own !== undefined && own !== 'max' && (cap === null || EFFORT_LEVELS.indexOf(own) < EFFORT_LEVELS.indexOf(cap))) cap = own
  }
  return cap
}

// 317 chunk-b1g74dkj ES/yle/hBe. Explicit overrides precede metadata,
// then legacy exclusions, baked catalog capabilities and provider defaults.
function supportsEffortCapability(model: string, capability: 'effort' | 'max_effort' | 'xhigh_effort'): boolean {
  if (getIndependentProfile(model)?.supportsReasoning === false) return false
  const thirdParty = get3PModelCapabilityOverride(model, capability)
  if (thirdParty !== undefined) return thirdParty
  if (capability !== 'effort' && getModelCapabilityEnvOverride(model, 'effort') === false) return false
  const configured = getModelCapabilityEnvOverride(model, capability)
  if (configured !== undefined) return configured
  const levels = getModelCapability(model)?.effort_levels?.map(value => value.trim().toLowerCase())
  if (levels !== undefined) return capability === 'effort' ? levels.length > 0 : levels.includes(capability === 'max_effort' ? 'max' : 'xhigh')
  const entry = getCatalogModel(getModelBehavior317(model))
  const name = entry?.id ?? model.toLowerCase().replace(/\[1m\]$/i, '')
  const legacy = ['claude-opus-4-0', 'claude-opus-4-1', 'claude-sonnet-4-0', 'claude-sonnet-4-5', 'claude-haiku-4-5']
  if (capability !== 'effort') legacy.push('claude-opus-4-5')
  if (capability === 'xhigh_effort') legacy.push('claude-opus-4-6', 'claude-sonnet-4-6')
  if (name.includes('claude-3-') || legacy.includes(name)) return false
  if (capability === 'effort' && Boolean(process.env.CLAUDE_CODE_ALWAYS_ENABLE_EFFORT)) return true
  if (entry?.capabilities.includes(capability) || name === 'claude-mythos-5') return true
  return getAPIProvider() === 'firstParty' || getAPIProvider() === 'foundry'
}

export function modelSupportsEffort(model: string): boolean {
  return supportsEffortCapability(model, 'effort')
}

export function modelSupportsMaxEffort(model: string): boolean {
  return supportsEffortCapability(model, 'max_effort')
}

export function modelSupportsXHighEffort(model: string): boolean {
  return supportsEffortCapability(model, 'xhigh_effort')
}

export function isEffortLevel(value: string): value is EffortLevel {
  return (EFFORT_LEVELS as readonly string[]).includes(value)
}

export function parseEffortValue(value: unknown): EffortValue | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  if (typeof value === 'number' && isValidNumericEffort(value)) {
    return value
  }
  const raw = String(value).toLowerCase()
  const str = raw === 'med' ? 'medium' : raw
  if (isEffortLevel(str)) {
    return str
  }
  const numericValue = parseInt(str, 10)
  if (!isNaN(numericValue) && isValidNumericEffort(numericValue)) {
    return numericValue
  }
  return undefined
}

/**
 * Numeric values are model-default only and not persisted.
 * 'max' is session-scoped and is never persisted in 317.
 * Write sites call this before saving to settings so the Zod schema
 * (which only accepts string levels) never rejects a write.
 */
export function toPersistableEffort(
  value: EffortValue | undefined,
): Exclude<EffortLevel, 'max'> | undefined {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') {
    return value
  }
  return undefined
}

/**
 * Decide what effort level (if any) to persist when the user selects a model
 * in ModelPicker. Keeps an explicit prior /effort choice sticky even when it
 * matches the picked model's default, while letting purely-default and
 * session-ephemeral effort (CLI --effort, EffortCallout default) fall through
 * to undefined so it follows future model-default changes.
 *
 * priorPersisted must come from userSettings on disk
 * (getSettingsForSource('userSettings')?.effortLevel), NOT merged settings
 * (project/policy layers would leak into the user's global settings.json)
 * and NOT AppState.effortValue (includes session-scoped sources that
 * deliberately do not write to settings.json).
 */
export function resolvePickerEffortPersistence(
  picked: EffortLevel | undefined,
  modelDefault: EffortLevel,
  priorPersisted: EffortLevel | undefined,
  toggledInPicker: boolean,
): EffortLevel | undefined {
  const hadExplicit = priorPersisted !== undefined || toggledInPicker
  return hadExplicit || picked !== modelDefault ? picked : undefined
}

export function getEffortEnvOverride(): EffortValue | null | undefined {
  const envOverride = process.env.CLAUDE_CODE_EFFORT_LEVEL
  return envOverride?.toLowerCase() === 'unset' ||
    envOverride?.toLowerCase() === 'auto'
    ? null
    : parseEffortValue(envOverride)
}

/**
 * Resolve the effort value that will actually be sent to the API for a given
 * model, following the full precedence chain:
 *   env CLAUDE_CODE_EFFORT_LEVEL → appState.effortValue → model default
 *
 * Returns undefined when no effort parameter should be sent (env set to
 * 'unset', or no default exists for the model).
 */
export function resolveAppliedEffort(
  model: string,
  appStateEffortValue: EffortValue | undefined,
): EffortValue | undefined {
  if (!modelSupportsEffort(model)) return undefined
  const envOverride = getEffortEnvOverride()
  const cap = resolveEffortCap(model, getEnabledSettingSources().map(source => getSettingsForSource(source)).filter((layer): layer is NonNullable<typeof layer> => layer != null))
  if (envOverride === null && cap === null) return undefined
  const layers = getEnabledSettingSources().flatMap(source => {
    const settings = getSettingsForSource(source)
    return settings ? [{ source, settings }] : []
  })
  const settingsEffort = lookupSettingsEffort(buildEffortSettingsTable(layers), model)
  let resolved = envOverride === null ? getDefaultEffortForModel(model) : envOverride ?? appStateEffortValue ?? settingsEffort ?? getDefaultEffortForModel(model)
  if (cap !== null && typeof resolved === 'number') resolved = convertEffortValueToLevel(resolved)
  if (cap !== null && typeof resolved === 'string' && EFFORT_LEVELS.indexOf(resolved) > EFFORT_LEVELS.indexOf(cap)) resolved = cap
  // Clamp model-unsupported high effort tiers before constructing API requests.
  if (resolved === 'max' && !modelSupportsMaxEffort(model)) {
    return 'high'
  }
  if (resolved === 'xhigh' && !modelSupportsXHighEffort(model)) return 'high'
  return resolved
}

/**
 * Resolve the effort level to show the user. Wraps resolveAppliedEffort
 * with the 'high' fallback (what the API uses when no effort param is sent).
 * Single source of truth for the status bar and /effort output (CC-1088).
 */
export function getDisplayedEffortLevel(
  model: string,
  appStateEffort: EffortValue | undefined,
): EffortLevel {
  const resolved = resolveAppliedEffort(model, appStateEffort) ?? 'high'
  return convertEffortValueToLevel(resolved)
}

/**
 * Build the ` with {level} effort` suffix shown in Logo/Spinner.
 * Returns empty string if the user hasn't explicitly set an effort value.
 * Delegates to resolveAppliedEffort() so the displayed level matches what
 * the API actually receives (including max→high clamp for non-Opus models).
 */
export function getEffortSuffix(
  model: string,
  effortValue: EffortValue | undefined,
): string {
  if (effortValue === undefined) return ''
  const resolved = resolveAppliedEffort(model, effortValue)
  if (resolved === undefined) return ''
  return ` with ${convertEffortValueToLevel(resolved)} effort`
}

export function isValidNumericEffort(value: number): boolean {
  return Number.isInteger(value)
}

export function convertEffortValueToLevel(value: EffortValue): EffortLevel {
  if (typeof value === 'string') {
    // Runtime guard: value may come from remote config (GrowthBook) where
    // TypeScript types can't help us. Coerce unknown strings to 'high'
    // rather than passing them through unchecked.
    return isEffortLevel(value) ? value : 'high'
  }
  if (process.env.USER_TYPE === 'ant' && typeof value === 'number') {
    if (value <= 50) return 'low'
    if (value <= 85) return 'medium'
    if (value <= 100) return 'high'
    return 'max'
  }
  return 'high'
}

/**
 * Get user-facing description for effort levels
 *
 * @param level The effort level to describe
 * @returns Human-readable description
 */
export function getEffortLevelDescription(level: EffortLevel): string {
  switch (level) {
    case 'low':
      return 'Quick, straightforward implementation with minimal overhead'
    case 'medium':
      return 'Balanced approach with standard implementation and testing'
    case 'high':
      return 'Comprehensive implementation with extensive testing and documentation'
    case 'xhigh':
      return 'Extra high reasoning for complex tasks'
    case 'max':
      return 'Maximum capability with deepest reasoning (on supported models)'
  }
}

/**
 * Get user-facing description for effort values (both string and numeric)
 *
 * @param value The effort value to describe
 * @returns Human-readable description
 */
export function getEffortValueDescription(value: EffortValue): string {
  if (process.env.USER_TYPE === 'ant' && typeof value === 'number') {
    return `[ANT-ONLY] Numeric effort value of ${value}`
  }

  if (typeof value === 'string') {
    return getEffortLevelDescription(value)
  }
  return 'Balanced approach with standard implementation and testing'
}

export type OpusDefaultEffortConfig = {
  enabled: boolean
  dialogTitle: string
  dialogDescription: string
}

const OPUS_DEFAULT_EFFORT_CONFIG_DEFAULT: OpusDefaultEffortConfig = {
  enabled: true,
  dialogTitle: 'We recommend medium effort for Opus',
  dialogDescription:
    'Effort determines how long Claude thinks for when completing your task. We recommend medium effort for most tasks to balance speed and intelligence and maximize rate limits. Use ultrathink to trigger high effort when needed.',
}

export function getOpusDefaultEffortConfig(): OpusDefaultEffortConfig {
  const config = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_grey_step2',
    OPUS_DEFAULT_EFFORT_CONFIG_DEFAULT,
  )
  return {
    ...OPUS_DEFAULT_EFFORT_CONFIG_DEFAULT,
    ...config,
  }
}

// 317 Rgr/K/Ke/Xe: remote per-model defaults, runtime metadata, then catalog.
export function getDefaultEffortForModel(model: string): EffortValue | undefined {
  const entry = getCatalogModel(getModelBehavior317(model))
  const overrides = getFeatureValue_CACHED_MAY_BE_STALE<Record<string, string>>('tengu_witty_wand', {})
  const configured = overrides && typeof overrides === 'object' ? overrides[entry?.id ?? model] : undefined
  if (typeof configured === 'string') {
    const level = configured.trim().toLowerCase()
    if (isEffortLevel(level)) return level
  }
  const runtime = getModelCapability(model)?.default_effort?.trim().toLowerCase()
  if (runtime && isEffortLevel(runtime)) return runtime
  const catalogDefault = entry?.default_effort
  return catalogDefault && isEffortLevel(catalogDefault) ? catalogDefault : 'high'
}
