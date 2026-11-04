// Directly migrated from 2.1.317 chunk-74x0zd10 (catalog, L, yQ, oLt/aSs).
import catalog from './model-catalog-317.json'

export const MODEL_CATALOG = catalog
// Lazily initialize: model cost constants call the canonicalizer while the
// model/effort/settings module cycle is still being evaluated.
let catalogState: { models: Map<string, (typeof catalog.models)[number]>, providerIds: Map<string, string> } | undefined
function getCatalogState() {
  if (catalogState) return catalogState
  const models = new Map(catalog.models.map(entry => [entry.id, entry]))
  const providerIds = new Map<string, string>()
  for (const entry of catalog.models) {
    for (const id of Object.values(entry.provider_ids)) {
      if (typeof id !== 'string') continue
      const normalized = id.toLowerCase()
      const previous = providerIds.get(normalized)
      if (previous !== undefined && previous !== entry.id) throw new Error('model catalog: provider id collision across distinct entries')
      providerIds.set(normalized, entry.id)
    }
  }
  return catalogState = { models, providerIds }
}

export function getCatalogModel(model: string) {
  const { models, providerIds } = getCatalogState()
  const normalized = model.toLowerCase().replace(/\[1m\]$/i, '')
  const direct = models.get(normalized) ?? models.get(providerIds.get(normalized) ?? '')
  if (direct) return direct
  const regional = normalized.replace(/^[a-z-]+\.anthropic\./, 'us.anthropic.')
  const mapped = models.get(providerIds.get(regional) ?? '')
  if (mapped) return mapped
  // Provider version/date suffixes remain the same catalog model.
  return [...catalog.models].sort((a, b) => b.id.length - a.id.length).find(entry => {
    const index = normalized.indexOf(entry.id)
    if (index < 0) return false
    const tail = normalized.slice(index + entry.id.length)
    return tail === '' || /^(?:-|@|:|\[)/.test(tail)
  })
}

export function getModelCapabilityEnvOverride(model: string, capability: string): boolean | undefined {
  const declarations = process.env.CLAUDE_CODE_MODEL_CAPABILITIES
  if (declarations === undefined) return undefined
  const name = (getCatalogModel(model)?.id ?? model.toLowerCase()).replace(/\[1m\]/gi, '')
  const values = new Map<string, boolean>()
  for (const declaration of declarations.split(';')) {
    const equal = declaration.indexOf('=')
    if (equal !== -1) {
      const selector = declaration.slice(0, equal).trim()
      if (!selector || !(selector.endsWith('*') ? name.startsWith(selector.slice(0, -1)) : name === selector)) continue
    }
    for (const raw of (equal === -1 ? declaration : declaration.slice(equal + 1)).split(',')) {
      const value = raw.trim()
      const enabled = !value.startsWith('-')
      values.set(enabled ? value : value.slice(1), enabled)
    }
  }
  return values.get(capability)
}
