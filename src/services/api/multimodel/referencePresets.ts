/**
 * Documented model limits for providers whose /models endpoint omits optional
 * capability fields. Exact model IDs only; never infer a model generation.
 *
 * These describe published model capabilities, not account entitlements.
 * The active account's /models values override individual preset fields.
 */
import { resolveIndependentModel } from './registry.js'

export type ModelReferencePreset = {
  contextWindow?: number
  maxOutputTokens?: number
  supportsTools?: boolean
  supportsVision?: boolean
  supportsReasoning?: boolean
  supportedEffort?: string[]
  defaultEffort?: string
  referenceUrl: string
}

const PRESETS: Readonly<Record<string, ModelReferencePreset>> = {
  'minimax/minimax-m3.1-flash': {
    contextWindow: 1_000_000, maxOutputTokens: 524_288,
    supportsTools: true, supportsVision: true, supportsReasoning: true,
    supportedEffort: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'max',
    referenceUrl: 'https://docs.cloudsway.net/zh/maasapi/api-reference/text/MiniMax-M3.1/',
  },
  'deepseek/deepseek-flash': {
    contextWindow: 1_048_576, maxOutputTokens: 393_216,
    supportsTools: true, supportsVision: true, supportsReasoning: true,
    supportedEffort: ['low', 'high', 'max'], defaultEffort: 'high',
    referenceUrl: 'https://api-docs.deepseek.com/api/list-models/',
  },
  'deepseek/deepseek-v4-pro': {
    contextWindow: 1_048_576, maxOutputTokens: 393_216,
    supportsTools: true, supportsVision: false, supportsReasoning: true,
    supportedEffort: ['low', 'high', 'max'], defaultEffort: 'high',
    referenceUrl: 'https://api-docs.deepseek.com/api/list-models/',
  },
  'qwen/qwen3.8-max': {
    contextWindow: 1_000_000, maxOutputTokens: 131_072,
    supportsTools: true, supportsVision: true, supportsReasoning: true,
    referenceUrl: 'https://help.aliyun.com/zh/model-studio/qwen3-8-max',
  },
  'qwen/qwen3.8-flash': {
    contextWindow: 1_000_000, maxOutputTokens: 131_072,
    supportsTools: true, supportsVision: true, supportsReasoning: true,
    referenceUrl: 'https://help.aliyun.com/zh/model-studio/qwen3-8-flash',
  },
  'qwen/qwen3.7-plus': {
    contextWindow: 1_000_000, maxOutputTokens: 131_072,
    supportsTools: true, supportsVision: true, supportsReasoning: true,
    referenceUrl: 'https://help.aliyun.com/zh/model-studio/text-generation-model',
  },
  'zhipu/glm-5.3': {
    contextWindow: 1_048_576, maxOutputTokens: 131_072,
    supportsTools: true, supportsVision: false, supportsReasoning: true,
    referenceUrl: 'https://help.aliyun.com/zh/model-studio/glm-5-3-by-zhipu',
  },
  'kimi/kimi-k3.1-pro': {
    contextWindow: 1_048_576, supportsVision: true, supportsReasoning: true,
    // The developer model card does not publish a separate output ceiling.
    referenceUrl: 'https://huggingface.co/moonshotai/Kimi-K3.1-Pro',
  },
}

export const MODEL_PROFILE_FIELDS = [
  'contextWindow', 'maxOutputTokens', 'supportsTools', 'supportsVision',
  'supportsReasoning', 'supportedEffort', 'defaultEffort',
] as const
export type ModelProfileField = (typeof MODEL_PROFILE_FIELDS)[number]

export function getDocumentedModelPreset(model: string): ModelReferencePreset | undefined {
  if (!resolveIndependentModel(model)) return undefined
  const preset = PRESETS[model.toLowerCase()]
  if (!preset) return undefined
  // Do not let mutable arrays in call sites mutate the reference catalog.
  return { ...preset, ...(preset.supportedEffort ? { supportedEffort: [...preset.supportedEffort] } : {}) }
}

export function getDocumentedModelPresetInventory(): Array<{ model: string } & ModelReferencePreset> {
  return Object.entries(PRESETS).map(([model, preset]) => ({
    model, ...preset,
    ...(preset.supportedEffort ? { supportedEffort: [...preset.supportedEffort] } : {}),
  }))
}
