/**
 * 333 independent provider credential vault.
 * Only explicit user actions write API keys; no telemetry or cloud sync.
 */
import { randomUUID } from 'node:crypto'
import { promises as fs, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { IndependentProvider } from '../api/multimodel/registry.js'
const PATH = join(homedir(), '.333', 'auth', 'provider-api-keys.json')
type Vault = { schema: 1; keys: Partial<Record<IndependentProvider, string>> }
const EMPTY: Vault = { schema: 1, keys: {} }
const SUPPORTED = new Set<string>(['openai','gemini','xai','deepseek','qwen','kimi','zhipu','minimax','openrouter'])
export function validateApiKeyProvider(provider: string): IndependentProvider {
  if (!SUPPORTED.has(provider)) throw new Error(`API Key 服务商未识别：${provider}`)
  return provider as IndependentProvider
}
export function readProviderApiKey(provider: IndependentProvider): string | undefined {
  let contents: string
  try { contents = readFileSync(PATH, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  const parsed = JSON.parse(contents) as Vault
  if (parsed.schema !== 1 || !parsed.keys || typeof parsed.keys !== 'object') throw new Error('Invalid provider API key vault')
  const key = parsed.keys[provider]
  if (key !== undefined && (typeof key !== 'string' || !key.trim())) throw new Error('Corrupted saved API key record')
  return key
}
function readVault(): Vault {
  try {
    const value = JSON.parse(readFileSync(PATH,'utf8')) as Vault
    if (value.schema !== 1 || !value.keys || typeof value.keys !== 'object') throw new Error('Invalid provider API key vault')
    return value
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schema: 1, keys: {} }
    throw error
  }
}
async function writeVault(vault: Vault): Promise<void> {
  await fs.mkdir(dirname(PATH), { recursive: true, mode: 0o700 })
  const tmp = `${PATH}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(tmp, JSON.stringify(vault), { mode: 0o600, flag: 'wx' })
    await fs.rename(tmp, PATH)
    await fs.chmod(PATH, 0o600)
  } finally { await fs.rm(tmp, { force: true }) }
}
export async function setProviderApiKey(provider: IndependentProvider, key: string): Promise<void> {
  validateApiKeyProvider(provider)
  if (!key || key.trim() !== key || key.length < 5 || key.length > 8192) {
    throw new Error('Invalid API Key format')
  }
  const current = readVault()
  await writeVault({ schema: 1, keys: { ...current.keys, [provider]: key } })
}
export async function deleteProviderApiKey(provider: IndependentProvider): Promise<void> {
  validateApiKeyProvider(provider)
  const current = readVault()
  delete current.keys[provider]
  await writeVault(current)
}
export function listProviderApiKeyAccounts(): string[] {
  return Object.keys(readVault().keys).filter(x => SUPPORTED.has(x))
}
