import { lock } from '../../../utils/lockfile.js'
/**
 * Per-account model discovery cache. The original Claude model catalog remains
 * intact; independent provider model choices are added without modifying prompts.
 */
import { promises as fs, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  PROVIDERS, type IndependentProvider,
  getIndependentApiKey, resolveIndependentModel, discoverIndependentModelDetails,
  isRetiredIndependentProvider, isRemovedIndependentModel,
} from './registry.js'
import { getChatGPTAuthorization, getSavedChatGPTAccount } from '../../auth/chatgptOAuth.js'
import { getCatalogModelsForProvider } from '../../../utils/model/modelCatalog.js'
import { getAPIProvider } from '../../../utils/model/providers.js'
import { mergeDiscoveredModelProfiles } from './profiles.js'
import { getModelStorageRoot } from './storage.js'

const catalogFile = () => join(getModelStorageRoot(), 'catalog.json')
type ModelEntry = {
  provider: IndependentProvider
  id: string
  displayName?: string
  discoveredAt: string
  account?: string
}
export type SavedCatalog = { schema: 1; models: ModelEntry[] }

export function readSavedModelCatalog(): SavedCatalog {
  let text: string
  try { text = readFileSync(catalogFile(), 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schema: 1, models: [] }
    throw error
  }
  const data = JSON.parse(text) as SavedCatalog
  if (data.schema !== 1 || !Array.isArray(data.models)) throw new Error('Invalid local model catalog format')
  const activeModels: ModelEntry[] = []
  for (const model of data.models) {
    // Older 333 installations may have cached providers no longer enabled.
    if (isRetiredIndependentProvider(model?.provider) ||
        (model && isRemovedIndependentModel(`${model.provider}/${model.id}`))) continue
    if (!model || !resolveIndependentModel(`${model.provider}/${model.id}`) || !model.discoveredAt) {
      throw new Error('Invalid entry in local model catalog')
    }
    activeModels.push(model)
  }
  return { schema: 1, models: activeModels }
}
export function getSavedModelOptions(): Array<{ value: string; label: string; description: string }> {
  const account = getSavedChatGPTAccount()
  return readSavedModelCatalog().models.filter(model =>
    model.provider !== 'chatgpt' || (account !== undefined && model.account === account)).map(model => ({
    value: `${model.provider}/${model.id}`,
    label: model.displayName ?? model.id,
    description: `${model.provider} · ${model.id}`, 
  }))
}
export async function refreshProviderModels(provider: IndependentProvider): Promise<ModelEntry[]> {
  const route = resolveIndependentModel(`${provider}/probe`)
  if (!route) throw new Error(`No route registered for ${provider}`)
  const auth = provider === 'chatgpt' ? await getChatGPTAuthorization() : undefined
  const token = auth?.token ?? getIndependentApiKey(route)
  const details = await discoverIndependentModelDetails(provider, token)
  const at = new Date().toISOString()
  const seen = new Set<string>()
  const refreshed = details.filter(item => {
    if (!item.id || seen.has(item.id)) return false
    seen.add(item.id)
    return item.id.length <= 300 && !Array.from(item.id).some(char => char.charCodeAt(0) < 32)
  }).map(item => ({ provider, id: item.id,
    ...(item.displayName ? { displayName: item.displayName } : {}),
    discoveredAt: at, ...(auth && { account: auth.account }) }))
  await mergeDiscoveredModelProfiles(provider, details, auth?.account)
  // Preserve all other providers while atomically replacing this provider.
  const root = getModelStorageRoot()
  const file = join(root, 'catalog.json')
  await fs.mkdir(root, { recursive: true, mode: 0o700 })
  const release = await lock(file, { realpath: false, retries: { retries: 5, minTimeout: 25 } })
  const tmp = join(root, `catalog.${randomUUID()}.tmp`)
  try {
    if (auth && getSavedChatGPTAccount() !== auth.account) {
      throw new Error('ChatGPT account changed during model discovery')
    }
    const current = readSavedModelCatalog()
    const next: SavedCatalog = {
      schema: 1,
      // ChatGPT model lists belong to individual OAuth registrations. Keep
      // other accounts' catalogs isolated and available after switching back.
      models: [...current.models.filter(x => x.provider !== provider ||
        (provider === 'chatgpt' && x.account !== auth?.account)), ...refreshed],
    }
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await fs.rename(tmp, file)
  } finally {
    try { await fs.rm(tmp, { force: true }) } finally { await release() }
  }
  return refreshed
}
export type RegisteredModel = {
  id: string
  provider: string
  label: string
  source: 'built-in' | 'discovered'
  restricted: boolean
}

/** One inventory for CLI, SDK inspection and support diagnostics. */
export function getRegisteredModelInventory(): RegisteredModel[] {
  const provider = getAPIProvider()
  const catalogProvider = provider === 'firstParty' ? 'first_party' : provider
  const native = getCatalogModelsForProvider(catalogProvider).flatMap(entry => {
    const id = entry.provider_ids[catalogProvider]
    return typeof id === 'string'
      ? [{ id, provider, label: entry.display_name, source: 'built-in' as const,
          restricted: entry.family === 'mythos' }]
      : []
  })
  const independent = getSavedModelOptions().map(option => {
    const provider = option.value.slice(0, option.value.indexOf('/'))
    return { id: option.value, provider, label: option.label,
      source: 'discovered' as const, restricted: false }
  })
  return [...native, ...independent]
}

export function listSupportedProviders(): IndependentProvider[] {
  return Object.keys(PROVIDERS) as IndependentProvider[]
}
