/**
 * Exact model limits are provider-specific, discovered where possible and
 * configurable when a model endpoint does not publish limits. Never copy
 * Claude's context/output budgets to an unrelated remote model.
 */
import { createHash, randomUUID } from 'node:crypto'
import { promises as fs, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isRetiredIndependentProvider, isRemovedIndependentModel, resolveIndependentModel } from './registry.js'
import { getModelStorageRoot } from './storage.js'
import { getSavedChatGPTAccount } from '../../auth/chatgptOAuth.js'

const profilesFile = () => join(getModelStorageRoot(), 'profiles.json')
const accountSuffix = '::account:'
function storedModelKey(model: string, identity?: string): string | undefined {
  if (resolveIndependentModel(model)?.provider !== 'chatgpt') return model
  const account = identity ?? getSavedChatGPTAccount()
  if (!account) return undefined
  // The account name is metadata, but keeping raw user/workspace identifiers
  // out of the profile JSON avoids exposing them to model diagnostics.
  return model + accountSuffix + createHash('sha256').update(account).digest('hex')
}

export type IndependentModelProfile = {
  contextWindow?: number
  maxOutputTokens?: number
  supportsTools?: boolean
  supportsVision?: boolean
  supportsReasoning?: boolean
  /** Exact permitted inference levels, when published by the provider. */
  supportedEffort?: string[]
  defaultEffort?: string
  checkedAt?: string
  source: 'provider' | 'manual'
}

function optionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value : undefined
}
function validatedProfile(model: string, candidate: IndependentModelProfile): IndependentModelProfile {
  if (!resolveIndependentModel(model)) throw new Error('Qualified provider/model ID required')
  const contextWindow = optionalPositiveInteger(candidate.contextWindow)
  const maxOutputTokens = optionalPositiveInteger(candidate.maxOutputTokens)
  if (candidate.contextWindow !== undefined && contextWindow === undefined) {
    throw new Error('Invalid model context window')
  }
  if (candidate.maxOutputTokens !== undefined && maxOutputTokens === undefined) {
    throw new Error('Invalid model output limit')
  }
  if (contextWindow !== undefined && maxOutputTokens !== undefined && maxOutputTokens > contextWindow) {
    throw new Error('Model output limit cannot exceed context window')
  }
  if (candidate.source !== 'provider' && candidate.source !== 'manual') {
    throw new Error('Unrecognized model profile origin')
  }
  for (const key of ['supportsTools', 'supportsVision', 'supportsReasoning'] as const) {
    if (candidate[key] !== undefined && typeof candidate[key] !== 'boolean') {
      throw new Error(`Invalid model capability: ${key}`)
    }
  }
  if (candidate.supportedEffort !== undefined) {
    const allowed = new Set(['low', 'medium', 'high', 'xhigh', 'max'])
    if (!Array.isArray(candidate.supportedEffort) ||
        !candidate.supportedEffort.every(level => typeof level === 'string' && allowed.has(level)) ||
        new Set(candidate.supportedEffort).size !== candidate.supportedEffort.length) {
      throw new Error('Invalid model supported effort levels')
    }
  }
  if (candidate.defaultEffort !== undefined && (typeof candidate.defaultEffort !== 'string' ||
      !(candidate.supportedEffort ?? []).includes(candidate.defaultEffort))) {
    throw new Error('Model default effort must appear in supported levels')
  }
  return { ...candidate, ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }) }
}

export function readIndependentProfiles(): Record<string, IndependentModelProfile> {
  let data: string
  try { data = readFileSync(profilesFile(), 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
  const profiles = JSON.parse(data) as Record<string, IndependentModelProfile>
  if (profiles === null || Array.isArray(profiles) || typeof profiles !== 'object') {
    throw new Error('Invalid model profile storage')
  }
  const active: Record<string, IndependentModelProfile> = {}
  for (const [storedKey, profile] of Object.entries(profiles)) {
    const model = storedKey.split(accountSuffix, 1)[0] ?? ''
    // Retired or legacy unscoped ChatGPT profiles must never become
    // authoritative for another OAuth registration's model capabilities.
    if (isRetiredIndependentProvider(model.split('/', 1)[0]) ||
        isRemovedIndependentModel(model) ||
        (resolveIndependentModel(model)?.provider === 'chatgpt' &&
          !storedKey.includes(accountSuffix))) continue
    validatedProfile(model, profile)
    active[storedKey] = profile
  }
  return active
}
export function getIndependentProfile(model: string): IndependentModelProfile | undefined {
  if (!resolveIndependentModel(model)) return undefined
  const key = storedModelKey(model)
  return key ? readIndependentProfiles()[key] : undefined
}
export async function updateIndependentProfile(
  model: string,
  patch: Partial<IndependentModelProfile> & { source: IndependentModelProfile['source'] },
): Promise<IndependentModelProfile> {
  if (!resolveIndependentModel(model)) throw new Error('Qualified provider/model ID required')
  const key = storedModelKey(model)
  if (!key) throw new Error('Select an authorized ChatGPT account before modifying its model profile')
  const existing = readIndependentProfiles()
  // A provider's discovery response cannot overwrite an explicit user setting.
  if (existing[key]?.source === 'manual' && patch.source === 'provider') return existing[key]
  const next = validatedProfile(model, {
    ...existing[key], ...patch,
    source: patch.source, checkedAt: new Date().toISOString(),
  })
  const root = getModelStorageRoot()
  const file = join(root, 'profiles.json')
  await fs.mkdir(root, { recursive: true, mode: 0o700 })
  const temporary = join(root, `profiles.${randomUUID()}.tmp`)
  try {
    await fs.writeFile(temporary, JSON.stringify({ ...existing, [key]: next }, null, 2),
      { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await fs.rename(temporary, file)
    await fs.chmod(file, 0o600)
  } finally {
    await fs.rm(temporary, { force: true })
  }
  return next
}

/** Apply one provider discovery response as a single atomic update. */
export async function mergeDiscoveredModelProfiles(
  provider: string,
  details: ReadonlyArray<{ id: string; contextWindow?: number; maxOutputTokens?: number;
    supportsTools?: boolean; supportsVision?: boolean; supportedEffort?: string[]; defaultEffort?: string }>,
  accountIdentity?: string,
): Promise<number> {
  const current = readIndependentProfiles()
  const next = { ...current }
  let changed = 0
  const checkedAt = new Date().toISOString()
  for (const detail of details) {
    const id = `${provider}/${detail.id}`
    const key = storedModelKey(id, accountIdentity)
    if (!key || !resolveIndependentModel(id) || next[key]?.source === 'manual') continue
    if (detail.contextWindow === undefined && detail.maxOutputTokens === undefined &&
        detail.supportsTools === undefined && detail.supportsVision === undefined &&
        detail.supportedEffort === undefined && detail.defaultEffort === undefined) continue
    next[key] = validatedProfile(id, {
      ...next[key], ...detail,
      source: 'provider', checkedAt,
    })
    changed++
  }
  if (changed === 0) return 0
  const root = getModelStorageRoot()
  const file = join(root, 'profiles.json')
  await fs.mkdir(root, { recursive: true, mode: 0o700 })
  const temporary = join(root, `profiles.${randomUUID()}.tmp`)
  try {
    await fs.writeFile(temporary, JSON.stringify(next, null, 2),
      { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await fs.rename(temporary, file)
    await fs.chmod(file, 0o600)
  } finally {
    await fs.rm(temporary, { force: true })
  }
  return changed
}
