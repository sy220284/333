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
import { getDocumentedModelPreset, MODEL_PROFILE_FIELDS, type ModelProfileField } from './referencePresets.js'

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
  source: 'provider' | 'manual' | 'preset'
  /** Each field's origin, so mixed provider+reference profiles remain clear. */
  parameterSources?: Partial<Record<ModelProfileField, 'provider' | 'manual' | 'preset'>>
  referenceUrl?: string
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
  if (candidate.source !== 'provider' && candidate.source !== 'manual' && candidate.source !== 'preset') {
    throw new Error('Unrecognized model profile origin')
  }
  if (candidate.parameterSources !== undefined) {
    if (!candidate.parameterSources || typeof candidate.parameterSources !== 'object' ||
        Array.isArray(candidate.parameterSources)) throw new Error('Invalid parameter source mapping')
    for (const [field, source] of Object.entries(candidate.parameterSources)) {
      if (!(MODEL_PROFILE_FIELDS as readonly string[]).includes(field) ||
          !['provider', 'manual', 'preset'].includes(String(source))) {
        throw new Error('Invalid parameter source entry')
      }
    }
  }
  if (candidate.referenceUrl !== undefined &&
      (typeof candidate.referenceUrl !== 'string' ||
        !candidate.referenceUrl.startsWith('https://'))) {
    throw new Error('Invalid model reference URL')
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
function withDocumentedPreset(
  model: string, saved: IndependentModelProfile | undefined,
): IndependentModelProfile | undefined {
  // A manual profile belongs to the user, including deliberate omissions.
  if (saved?.source === 'manual') return saved
  const preset = getDocumentedModelPreset(model)
  if (!preset) return saved
  const { referenceUrl, ...parameters } = preset
  const parameterSources: IndependentModelProfile['parameterSources'] = {}
  // A published context override can invalidate a larger reference output.
  // Leave the output unconfirmed until the endpoint supplies its own limit.
  const limit = saved?.contextWindow ?? parameters.contextWindow
  if (limit !== undefined && saved?.maxOutputTokens === undefined &&
      parameters.maxOutputTokens !== undefined && parameters.maxOutputTokens > limit) {
    delete parameters.maxOutputTokens
  }
  for (const field of MODEL_PROFILE_FIELDS) {
    if (saved?.[field] !== undefined) {
      parameterSources[field] = saved.parameterSources?.[field] ?? saved.source
    } else if (parameters[field] !== undefined) {
      parameterSources[field] = 'preset'
    }
  }
  const merged: IndependentModelProfile = {
    ...parameters, ...saved,
    source: saved?.source ?? 'preset',
    parameterSources,
    referenceUrl,
  }
  if (merged.defaultEffort !== undefined && merged.supportedEffort !== undefined &&
      !merged.supportedEffort.includes(merged.defaultEffort)) {
    delete merged.defaultEffort
    delete merged.parameterSources?.defaultEffort
  }
  return merged
}

export function getIndependentProfile(model: string): IndependentModelProfile | undefined {
  if (!resolveIndependentModel(model)) return undefined
  const key = storedModelKey(model)
  return withDocumentedPreset(model, key ? readIndependentProfiles()[key] : undefined)
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
  if (existing[key]?.source === 'manual' && patch.source !== 'manual') return existing[key]
  const next = validatedProfile(model, {
    ...existing[key], ...patch,
    ...(patch.source === 'manual' ? { parameterSources: {
      ...existing[key]?.parameterSources,
      ...Object.fromEntries(MODEL_PROFILE_FIELDS.filter(field => patch[field] !== undefined)
        .map(field => [field, 'manual' as const])),
    } } : {}),
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
    const base = withDocumentedPreset(id, next[key])
    const detailed = detail as Record<string, unknown>
    const providerFields = MODEL_PROFILE_FIELDS.filter(field => detailed[field] !== undefined)
    if (!base && providerFields.length === 0) continue
    const parameterSources = { ...base?.parameterSources }
    for (const field of providerFields) parameterSources[field] = 'provider'
    const candidate = {
      ...base, ...detail,
      parameterSources,
      source: providerFields.length ? 'provider' as const : (base?.source ?? 'preset' as const),
      checkedAt,
    }
    // Provider-supported effort levels override documentation presets;
    // an incompatible default cannot be passed along to request builders.
    if (candidate.defaultEffort !== undefined &&
        candidate.supportedEffort !== undefined &&
        !candidate.supportedEffort.includes(candidate.defaultEffort)) {
      delete candidate.defaultEffort
      delete candidate.parameterSources.defaultEffort
    }
    next[key] = validatedProfile(id, candidate)
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
