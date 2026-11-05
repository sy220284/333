import { getEnabledSettingSources, SETTING_SOURCES } from '../settings/constants.js'
import { getSettingsForSource } from '../settings/settings.js'
import { getCatalogModel } from './modelCatalog.js'

type BehaviorRow = { model: string; behavesAs?: string }

export function resolveModelBehavior317(model: string, rows: readonly BehaviorRow[]): string {
  const normalize = (value: string) => value.trim().toLowerCase()
  const seen = new Set<string>()
  let current = model
  for (let hops = 0; hops < 8; hops++) {
    if (getCatalogModel(current)) return current
    const key = normalize(current)
    if (!key || seen.has(key)) return model
    seen.add(key)
    const target = rows.find(row => normalize(row.model) === key)?.behavesAs?.trim()
    if (!target) return model
    current = target
  }
  return getCatalogModel(current) ? current : model
}

export function getModelBehavior317(model: string): string {
  if (getCatalogModel(model)) return model
  const enabled = getEnabledSettingSources()
  for (const source of SETTING_SOURCES) {
    if (!enabled.includes(source)) continue
    const picker = getSettingsForSource(source)?.modelPicker
    if (picker) return resolveModelBehavior317(model, picker.options)
  }
  return model
}
