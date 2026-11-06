/**
 * Exact model limits are provider-specific, discovered where possible and
 * configurable when a model endpoint does not publish limits. Never copy
 * Claude's context/output budgets to an unrelated remote model.
 */
import { randomUUID } from 'node:crypto'
import { promises as fs, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isRetiredIndependentProvider, resolveIndependentModel } from './registry.js'

const ROOT = join(homedir(), '.333', 'models')
const PATH = join(ROOT, 'profiles.json')

export type IndependentModelProfile = {
  contextWindow?: number
  maxOutputTokens?: number
  supportsTools?: boolean
  supportsVision?: boolean
  supportsReasoning?: boolean
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
  return { ...candidate, ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }) }
}

export function readIndependentProfiles(): Record<string, IndependentModelProfile> {
  let data: string
  try { data = readFileSync(PATH, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
  const profiles = JSON.parse(data) as Record<string, IndependentModelProfile>
  if (profiles === null || Array.isArray(profiles) || typeof profiles !== 'object') {
    throw new Error('Invalid model profile storage')
  }
  const active: Record<string, IndependentModelProfile> = {}
  for (const [model, profile] of Object.entries(profiles)) {
    // Previously saved Gemini/Grok profiles must not block active providers.
    if (isRetiredIndependentProvider(model.split('/', 1)[0])) continue
    validatedProfile(model, profile)
    active[model] = profile
  }
  return active
}
export function getIndependentProfile(model: string): IndependentModelProfile | undefined {
  if (!resolveIndependentModel(model)) return undefined
  return readIndependentProfiles()[model]
}
export async function updateIndependentProfile(
  model: string,
  patch: Partial<IndependentModelProfile> & { source: IndependentModelProfile['source'] },
): Promise<IndependentModelProfile> {
  if (!resolveIndependentModel(model)) throw new Error('Qualified provider/model ID required')
  const existing = readIndependentProfiles()
  // A provider's discovery response cannot overwrite an explicit user setting.
  if (existing[model]?.source === 'manual' && patch.source === 'provider') return existing[model]
  const next = validatedProfile(model, {
    ...existing[model], ...patch,
    source: patch.source, checkedAt: new Date().toISOString(),
  })
  await fs.mkdir(ROOT, { recursive: true, mode: 0o700 })
  const temporary = join(ROOT, `profiles.${randomUUID()}.tmp`)
  try {
    await fs.writeFile(temporary, JSON.stringify({ ...existing, [model]: next }, null, 2),
      { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await fs.rename(temporary, PATH)
    await fs.chmod(PATH, 0o600)
  } finally {
    await fs.rm(temporary, { force: true })
  }
  return next
}

/** Apply one provider discovery response as a single atomic update. */
export async function mergeDiscoveredModelProfiles(
  provider: string,
  details: ReadonlyArray<{ id: string; contextWindow?: number; maxOutputTokens?: number; supportsTools?: boolean; supportsVision?: boolean }>,
): Promise<number> {
  const current = readIndependentProfiles()
  const next = { ...current }
  let changed = 0
  const checkedAt = new Date().toISOString()
  for (const detail of details) {
    const id = `${provider}/${detail.id}`
    if (!resolveIndependentModel(id) || next[id]?.source === 'manual') continue
    if (detail.contextWindow === undefined && detail.maxOutputTokens === undefined &&
        detail.supportsTools === undefined && detail.supportsVision === undefined) continue
    next[id] = validatedProfile(id, {
      ...next[id], ...detail,
      source: 'provider', checkedAt,
    })
    changed++
  }
  if (changed === 0) return 0
  await fs.mkdir(ROOT, { recursive: true, mode: 0o700 })
  const temporary = join(ROOT, `profiles.${randomUUID()}.tmp`)
  try {
    await fs.writeFile(temporary, JSON.stringify(next, null, 2),
      { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await fs.rename(temporary, PATH)
    await fs.chmod(PATH, 0o600)
  } finally {
    await fs.rm(temporary, { force: true })
  }
  return changed
}
