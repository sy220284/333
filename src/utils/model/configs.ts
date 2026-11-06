import type { ModelName } from './model.js'
import type { APIProvider } from './providers.js'
import catalog from './model-catalog-317.json'

export type ModelConfig = Record<APIProvider, ModelName>

function config(id: string): ModelConfig {
  const row = catalog.models.find(entry => entry.id === id)
  if (!row) throw new Error(`Model catalog missing ${id}`)
  const providers = row.provider_ids
  const result = { firstParty: providers.first_party, bedrock: providers.bedrock, vertex: providers.vertex, foundry: providers.foundry }
  for (const [provider, value] of Object.entries(result)) {
    if (typeof value !== 'string') throw new Error(`Model catalog ${id} missing ${provider}`)
  }
  return result as ModelConfig
}

export const CLAUDE_3_5_HAIKU_CONFIG = config('claude-3-5-haiku')
export const CLAUDE_HAIKU_4_5_CONFIG = config('claude-haiku-4-5')
export const CLAUDE_HAIKU_5_5_CONFIG = config('claude-haiku-5-5')
export const CLAUDE_3_5_V2_SONNET_CONFIG = config('claude-3-5-sonnet')
export const CLAUDE_3_7_SONNET_CONFIG = config('claude-3-7-sonnet')
export const CLAUDE_SONNET_4_CONFIG = config('claude-sonnet-4-0')
export const CLAUDE_SONNET_4_5_CONFIG = config('claude-sonnet-4-5')
export const CLAUDE_SONNET_4_6_CONFIG = config('claude-sonnet-4-6')
export const CLAUDE_SONNET_5_CONFIG = config('claude-sonnet-5')
export const CLAUDE_SONNET_5_5_CONFIG = config('claude-sonnet-5-5')
export const CLAUDE_OPUS_4_CONFIG = config('claude-opus-4-0')
export const CLAUDE_OPUS_4_1_CONFIG = config('claude-opus-4-1')
export const CLAUDE_OPUS_4_5_CONFIG = config('claude-opus-4-5')
export const CLAUDE_OPUS_4_6_CONFIG = config('claude-opus-4-6')
export const CLAUDE_OPUS_4_7_CONFIG = config('claude-opus-4-7')
export const CLAUDE_OPUS_4_8_CONFIG = config('claude-opus-4-8')
export const CLAUDE_OPUS_5_CONFIG = config('claude-opus-5')
export const CLAUDE_OPUS_5_5_CONFIG = config('claude-opus-5-5')
export const CLAUDE_FABLE_5_CONFIG = config('claude-fable-5')
export const CLAUDE_FABLE_5_1_CONFIG = config('claude-fable-5-1')
export const CLAUDE_MYTHOS_5_CONFIG = config('claude-mythos-5')
export const CLAUDE_MYTHOS_5_1_CONFIG = config('claude-mythos-5-1')

export const ALL_MODEL_CONFIGS = {
  haiku35: CLAUDE_3_5_HAIKU_CONFIG,
  haiku45: CLAUDE_HAIKU_4_5_CONFIG,
  haiku55: CLAUDE_HAIKU_5_5_CONFIG,
  sonnet35: CLAUDE_3_5_V2_SONNET_CONFIG,
  sonnet37: CLAUDE_3_7_SONNET_CONFIG,
  sonnet40: CLAUDE_SONNET_4_CONFIG,
  sonnet45: CLAUDE_SONNET_4_5_CONFIG,
  sonnet46: CLAUDE_SONNET_4_6_CONFIG,
  sonnet5: CLAUDE_SONNET_5_CONFIG,
  sonnet55: CLAUDE_SONNET_5_5_CONFIG,
  opus40: CLAUDE_OPUS_4_CONFIG,
  opus41: CLAUDE_OPUS_4_1_CONFIG,
  opus45: CLAUDE_OPUS_4_5_CONFIG,
  opus46: CLAUDE_OPUS_4_6_CONFIG,
  opus47: CLAUDE_OPUS_4_7_CONFIG,
  opus48: CLAUDE_OPUS_4_8_CONFIG,
  opus5: CLAUDE_OPUS_5_CONFIG,
  opus55: CLAUDE_OPUS_5_5_CONFIG,
  fable5: CLAUDE_FABLE_5_CONFIG,
  fable51: CLAUDE_FABLE_5_1_CONFIG,
  mythos5: CLAUDE_MYTHOS_5_CONFIG,
  mythos51: CLAUDE_MYTHOS_5_1_CONFIG,
} as const satisfies Record<string, ModelConfig>

export type ModelKey = keyof typeof ALL_MODEL_CONFIGS

/** Union of all canonical first-party model IDs, e.g. 'claude-opus-4-6' | 'claude-sonnet-4-5-20250929' | … */
export type CanonicalModelId =
  (typeof ALL_MODEL_CONFIGS)[ModelKey]['firstParty']

/** Runtime list of canonical model IDs — used by comprehensiveness tests. */
export const CANONICAL_MODEL_IDS = Object.values(ALL_MODEL_CONFIGS).map(
  c => c.firstParty,
) as [CanonicalModelId, ...CanonicalModelId[]]

/** Map canonical ID → internal short key. Used to apply settings-based modelOverrides. */
export const CANONICAL_ID_TO_KEY: Record<CanonicalModelId, ModelKey> =
  Object.fromEntries(
    (Object.entries(ALL_MODEL_CONFIGS) as [ModelKey, ModelConfig][]).map(
      ([key, cfg]) => [cfg.firstParty, key],
    ),
  ) as Record<CanonicalModelId, ModelKey>
