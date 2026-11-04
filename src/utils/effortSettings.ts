import type { EffortLevel } from '../entrypoints/sdk/runtimeTypes.js'
import { getCanonicalName, parseUserSpecifiedModel } from './model/model.js'

export type EffortSettings = {
  effortLevel?: EffortLevel
  modelSettings?: Record<string, { effortLevel?: EffortLevel; maxEffortLevel?: EffortLevel }>
}
export type EffortSettingsLayer = { source: string; settings: EffortSettings }
export type EffortSettingsTable = {
  default?: Exclude<EffortLevel, 'max'>
  legacyUserEffort?: Exclude<EffortLevel, 'max'>
  byModel: Record<string, Exclude<EffortLevel, 'max'> | undefined>
}

export function effortModelIdentity(model: string): string {
  return getCanonicalName(parseUserSpecifiedModel(model)).replace(/\[1m\]$/i, '')
}

function persisted(value: EffortLevel | undefined): Exclude<EffortLevel, 'max'> | undefined {
  return value !== 'max' ? value : undefined
}

/** 317 K6e: user top-level effort is a legacy default; other layers replace it. */
export function buildEffortSettingsTable(layers: readonly EffortSettingsLayer[], legacyExclusions: readonly string[] = []): EffortSettingsTable {
  let legacyUserEffort: EffortSettingsTable['legacyUserEffort']
  let defaultValue: EffortSettingsTable['default']
  let setsDefault = false
  for (const { source, settings } of layers) {
    if (source === 'userSettings') legacyUserEffort = persisted(settings.effortLevel)
    else if (settings.effortLevel !== undefined) {
      setsDefault = true
      defaultValue = persisted(settings.effortLevel)
    }
  }
  const ordered = [...layers].reverse()
  const maps = ordered.map(({ settings }) => {
    const result = new Map<string, EffortLevel>()
    for (const [name, values] of Object.entries(settings.modelSettings ?? {})) {
      if (values?.effortLevel === undefined) continue
      const key = effortModelIdentity(name)
      if (name === key || !result.has(key)) result.set(key, values.effortLevel)
    }
    return result
  })
  const keys = new Set(maps.flatMap(map => [...map.keys()]))
  const byModel: EffortSettingsTable['byModel'] = Object.create(null)
  for (const key of keys) {
    for (let index = 0; index < ordered.length; index++) {
      const own = maps[index]!.get(key)
      if (own !== undefined) { byModel[key] = persisted(own); break }
      const { source, settings } = ordered[index]!
      if (source !== 'userSettings' && settings.effortLevel !== undefined) {
        byModel[key] = persisted(settings.effortLevel)
        break
      }
    }
  }
  if (setsDefault) legacyUserEffort = undefined
  if (legacyUserEffort !== undefined) {
    for (const model of legacyExclusions) {
      const key = effortModelIdentity(model)
      if (!Object.hasOwn(byModel, key) && !Object.hasOwn(Object.prototype, key)) byModel[key] = undefined
    }
  }
  return { default: defaultValue, legacyUserEffort, byModel }
}

const LEGACY_EFFORT_MODELS = new Set([
  'claude-3-5-haiku', 'claude-3-5-sonnet', 'claude-3-7-sonnet', 'claude-haiku-4-5',
  'claude-sonnet-4-0', 'claude-sonnet-4-5', 'claude-sonnet-4-6', 'claude-sonnet-5',
  'claude-opus-4-0', 'claude-opus-4-1', 'claude-opus-4-5', 'claude-opus-4-6',
  'claude-opus-4-7', 'claude-opus-4-8', 'claude-opus-5', 'claude-fable-5',
  'claude-fable-5-1', 'claude-mythos-5', 'claude-mythos-5-1',
])

export function lookupSettingsEffort(table: EffortSettingsTable, model: string): EffortSettingsTable['default'] {
  const key = effortModelIdentity(model)
  if (Object.hasOwn(table.byModel, key)) return table.byModel[key]
  if (table.default !== undefined || table.legacyUserEffort === undefined) return table.default
  // 317 das: unknown deployment names retain the old global setting; newly
  // introduced well-formed Claude versions follow their model defaults.
  const wellFormedClaude = /^claude-(?:[a-z]+-\d{1,2}(?:-\d{1,2})?|\d{1,2}(?:-\d{1,2})?-[a-z]+)$/.test(key)
  return LEGACY_EFFORT_MODELS.has(key) || !wellFormedClaude ? table.legacyUserEffort : undefined
}

/** 317 cas: per-model updates merge through the existing settings writer. */
export function modelEffortSettingsUpdate(model: string, effortLevel: EffortLevel | undefined): { effortLevel?: Exclude<EffortLevel, 'max'>; modelSettings?: Record<string, { effortLevel?: Exclude<EffortLevel, 'max'> }> } {
  const value = persisted(effortLevel)
  const key = effortModelIdentity(model)
  if (Object.hasOwn(Object.prototype, key)) return { effortLevel: value }
  return { modelSettings: { [key]: { effortLevel: value } } }
}
