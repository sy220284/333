import { getEnabledSettingSources, SETTING_SOURCES } from '../settings/constants.js'
import { getSettingsForSource } from '../settings/settings.js'
import { getServedModelBehavior317 } from './modelCapabilities.js'
import { getCatalogModel } from './modelCatalog.js'

type BehaviorRow = { model: string; behavesAs?: string }

export function resolveModelBehavior317(
  model: string,
  rows: readonly BehaviorRow[],
  served: (model: string) => string | undefined = () => undefined,
): string {
  const normalize = (value: string) => value.trim().toLowerCase()
  function visit(current: string, seen: ReadonlySet<string>, hops: number): string | undefined {
    if (getCatalogModel(current)) return current
    const key = normalize(current)
    if (!key || hops >= 8 || seen.has(key)) return undefined
    const path = new Set(seen).add(key)
    const configured = rows.find(row => normalize(row.model) === key)?.behavesAs
    for (const mapping of [served(current), configured]) {
      const target = mapping?.trim()
      if (!target) continue
      const known = visit(target, path, hops + 1)
      if (known) return known
    }
    return undefined
  }
  return visit(model, new Set(), 0) ?? model
}

export function getModelBehavior317(model: string): string {
  if (getCatalogModel(model)) return model
  const enabled = getEnabledSettingSources()
  for (const source of SETTING_SOURCES) {
    if (!enabled.includes(source)) continue
    const picker = getSettingsForSource(source)?.modelPicker
    if (picker) return resolveModelBehavior317(model, picker.options, getServedModelBehavior317)
  }
  return resolveModelBehavior317(model, [], getServedModelBehavior317)
}
