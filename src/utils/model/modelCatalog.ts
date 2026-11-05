// Directly migrated from 2.1.317 chunk-74x0zd10 (catalog, L, yQ, oLt/aSs).
import catalog from './model-catalog-317.json'

export const MODEL_CATALOG = catalog
export type CatalogModel = (typeof catalog.models)[number]
export type CatalogProvider = keyof CatalogModel['provider_ids']
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

/** 317 Zh/YK: shared identity for metadata, settings, cost and request consumers. */
export function canonicalizeCatalogModel(model: string): string {
  const normalized = model.toLowerCase().replace(/(claude-(?:[a-z]+-)?\d{1,2})\.(?=\d)/g, '$1-')
  const { providerIds } = getCatalogState()
  const direct = providerIds.get(normalized)
  if (direct) return direct
  const regional = normalized.replace(/^(?:eu|apac|au|jp|us-gov|global)\.anthropic\./, 'us.anthropic.')
  const mapped = providerIds.get(regional)
  if (mapped) return mapped
  const unqualified = normalized.replace(/\[[12]m\]$/i, '').split('/').at(-1) ?? normalized
  const providerBase = unqualified.replace(/^(?:(?:us|eu|apac|au|jp|us-gov|global)\.)?anthropic\./, '')
  // A date/version trailer belongs to a model; an unknown minor version does not.
  const version = /^(claude-(?:[a-z]+-\d{1,2}(?!\d)(?:-\d{1,2}(?!\d))?|\d{1,2}(?!\d)(?:-\d{1,2}(?!\d))?-[a-z]+))((?:-fast|-latest)?(?:-v\d{1,3}@\d{8}|[-@]\d{8})?(?:-v\d{1,3}(?::\d{1,3})?)?)$/.exec(providerBase)
  if (version) {
    const base = version[1]!
    const row = catalog.models.find(entry => entry.id === base || entry.id === base + '-0')
    return row?.id ?? base
  }
  // Original legacy fallback recognises embedded spellings, longest first.
  const embedded = [...catalog.models].sort((a, b) => b.id.length - a.id.length).find(entry => !['claude-opus-4-0', 'claude-sonnet-4-0'].includes(entry.id) && normalized.includes(entry.id))
  if (embedded) return embedded.id
  if (/claude-opus-4(?!-\d(?!\d))/.test(normalized)) return 'claude-opus-4-0'
  if (/claude-sonnet-4(?!-\d(?!\d))/.test(normalized)) return 'claude-sonnet-4-0'
  for (const legacy of ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku']) {
    if (normalized.includes(legacy)) return legacy
  }
  return normalized.replace(/-\d{8}$/, '')
}

/** The complete baked-in catalog also contains first-party-only models. */
export function getCatalogModelsForProvider(provider: CatalogProvider): CatalogModel[] {
  return MODEL_CATALOG.models.filter(model => typeof model.provider_ids[provider] === 'string')
}

/** Choose each provider's actual family default instead of globally newest IDs. */
export function getCatalogPreferredModelsForProvider(provider: CatalogProvider): CatalogModel[] {
  const seen = new Set<string>()
  return Object.keys(MODEL_CATALOG.aliases).flatMap(family => {
    const model = getCatalogAliasModel(family, provider)
    if (!model || typeof model.provider_ids[provider] !== 'string' || seen.has(model.id)) return []
    seen.add(model.id)
    return [model]
  })
}

export function getCatalogModel(model: string): CatalogModel | undefined {
  return getCatalogState().models.get(canonicalizeCatalogModel(model.replace(/\[1m\]$/i, '')))
}

/** Resolve an alias to its provider ID before applying user modelOverrides. */
export function getCatalogAliasModel(alias: string, provider: CatalogProvider): CatalogModel | undefined {
  const aliases: Record<string, { default: string; per_provider?: Partial<Record<CatalogProvider, string>> }> = catalog.aliases
  const entry = Object.hasOwn(aliases, alias) ? aliases[alias] : undefined
  if (!entry) return undefined
  return getCatalogState().models.get(entry.per_provider?.[provider] ?? entry.default)
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
