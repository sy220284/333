/**
 * 摇摇车 independent provider credential vault.
 * Only explicit user actions write API keys; no telemetry or cloud sync.
 */
import { randomUUID } from 'node:crypto'
import { promises as fs, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { IndependentProvider } from '../api/multimodel/registry.js'
/** Use the same per-operation home resolution as the independent model catalog.
 * A module-level path can keep a different HOME when Bun preloads modules. */
function vaultPath(): string {
  const configuredHome = process.platform === 'win32'
    ? process.env.USERPROFILE
    : process.env.HOME
  return join(configuredHome || homedir(), '.yaoyaoche', 'auth', 'provider-api-keys.json')
}
type Vault = { schema: 1; keys: Partial<Record<IndependentProvider, string>> }
const SUPPORTED = new Set<string>(['openai','deepseek','qwen','kimi','zhipu','minimax'])
export function validateApiKeyProvider(provider: string): IndependentProvider {
  if (!SUPPORTED.has(provider)) throw new Error(`API Key 服务商未识别：${provider}`)
  return provider as IndependentProvider
}
export function readProviderApiKey(provider: IndependentProvider): string | undefined {
  validateApiKeyProvider(provider)
  let contents: string
  try { contents = readFileSync(vaultPath(), 'utf8') }
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
    const value = JSON.parse(readFileSync(vaultPath(),'utf8')) as Vault
    if (value.schema !== 1 || !value.keys || typeof value.keys !== 'object') throw new Error('Invalid provider API key vault')
    // Preserve valid credentials; retired-provider keys are never restored
    // by future writes to the current provider vault.
    const activeKeys = Object.fromEntries(Object.entries(value.keys).filter(([provider]) => SUPPORTED.has(provider)))
    return { schema: 1, keys: activeKeys }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schema: 1, keys: {} }
    throw error
  }
}
async function writeVault(vault: Vault): Promise<void> {
  const path = vaultPath()
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const tmp = `${path}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(tmp, JSON.stringify(vault), { mode: 0o600, flag: 'wx' })
    await fs.rename(tmp, path)
    await fs.chmod(path, 0o600)
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
