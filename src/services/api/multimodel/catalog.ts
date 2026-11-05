/**
 * Per-account model discovery cache. The original Claude model catalog remains
 * intact; independent provider model choices are added without modifying prompts.
 */
import { promises as fs, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import {
  PROVIDERS, type IndependentProvider, discoverIndependentModels,
  getIndependentApiKey, resolveIndependentModel,
} from './registry.js'
import { getChatGPTAccessToken } from '../../auth/chatgptOAuth.js'

const ROOT = join(homedir(), '.333', 'models')
const FILE = join(ROOT, 'catalog.json')
type ModelEntry = {
  provider: IndependentProvider
  id: string
  discoveredAt: string
}
export type SavedCatalog = { schema: 1; models: ModelEntry[] }

export function readSavedModelCatalog(): SavedCatalog {
  let text: string
  try { text = readFileSync(FILE, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schema: 1, models: [] }
    throw error
  }
  const data = JSON.parse(text) as SavedCatalog
  if (data.schema !== 1 || !Array.isArray(data.models)) throw new Error('Invalid local model catalog format')
  for (const model of data.models) {
    if (!resolveIndependentModel(`${model.provider}/${model.id}`) || !model.discoveredAt) {
      throw new Error('Invalid entry in local model catalog')
    }
  }
  return data
}
export function getSavedModelOptions(): Array<{ value: string; label: string; description: string }> {
  return readSavedModelCatalog().models.map(model => ({
    value: `${model.provider}/${model.id}`,
    label: model.id,
    description: `${model.provider} · ${model.id}`,
  }))
}
export async function refreshProviderModels(provider: IndependentProvider): Promise<ModelEntry[]> {
  const route = resolveIndependentModel(`${provider}/probe`)!
  const token = provider === 'chatgpt' ? await getChatGPTAccessToken() : getIndependentApiKey(route)
  const names = await discoverIndependentModels(provider, token)
  const at = new Date().toISOString()
  const refreshed = [...new Set(names)].filter(name => name && !name.includes('/') || provider === 'openrouter')
    .map(name => ({ provider, id: name, discoveredAt: at }))
  // Preserve all other providers while atomically replacing this provider.
  await fs.mkdir(ROOT, { recursive: true, mode: 0o700 })
  const current = readSavedModelCatalog()
  const next: SavedCatalog = {
    schema: 1,
    models: [...current.models.filter(x => x.provider !== provider), ...refreshed],
  }
  const tmp = join(ROOT, `catalog.${randomUUID()}.tmp`)
  try {
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await fs.rename(tmp, FILE)
    await fs.chmod(FILE, 0o600)
  } finally {
    await fs.rm(tmp, { force: true })
  }
  return refreshed
}
export function listSupportedProviders(): IndependentProvider[] {
  return Object.keys(PROVIDERS) as IndependentProvider[]
}
