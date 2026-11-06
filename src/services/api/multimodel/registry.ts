import { readProviderApiKey } from '../../auth/apiKeyVault.js'
/**
 * 333 model registry. Qualified IDs such as openai/gpt-6.1-sol or
 * deepseek/deepseek-chat select an independent remote API. Unqualified
 * model IDs keep the existing Anthropic behavior and prompt content.
 */
export type IndependentProvider =
  | 'openai' | 'chatgpt' | 'deepseek'
  | 'qwen' | 'kimi' | 'zhipu' | 'minimax' | 'openrouter'
export type Protocol = 'responses' | 'chat-completions'
export interface ProviderRoute {
  provider: IndependentProvider
  model: string
  protocol: Protocol
  endpoint: string
  keyEnvironment?: string
}
type Definition = { protocol: Protocol; endpoint: string; keyEnvironment?: string }
export const PROVIDERS: Readonly<Record<IndependentProvider, Definition>> = {
  openai: { protocol: 'responses', endpoint: 'https://api.openai.com/v1/responses', keyEnvironment: 'OPENAI_API_KEY' },
  chatgpt: { protocol: 'responses', endpoint: 'https://api.openai.com/v1/responses' },
  deepseek: { protocol: 'chat-completions', endpoint: 'https://api.deepseek.com/chat/completions', keyEnvironment: 'DEEPSEEK_API_KEY' },
  qwen: { protocol: 'chat-completions', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', keyEnvironment: 'DASHSCOPE_API_KEY' },
  kimi: { protocol: 'chat-completions', endpoint: 'https://api.moonshot.cn/v1/chat/completions', keyEnvironment: 'MOONSHOT_API_KEY' },
  zhipu: { protocol: 'chat-completions', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', keyEnvironment: 'ZHIPU_API_KEY' },
  minimax: { protocol: 'chat-completions', endpoint: 'https://api.minimax.io/v1/chat/completions', keyEnvironment: 'MINIMAX_API_KEY' },
  openrouter: { protocol: 'chat-completions', endpoint: 'https://openrouter.ai/api/v1/chat/completions', keyEnvironment: 'OPENROUTER_API_KEY' },
}
/** Explicit migration marker for previously saved provider entries. */
export function isRetiredIndependentProvider(provider: unknown): boolean {
  return provider === 'gemini' || provider === 'xai'
}
/** Apply model removals even when a gateway exposes those families. */
export function isRemovedIndependentModel(model: string): boolean {
  const slash = model.indexOf('/')
  if (slash < 1) return false
  const provider = model.slice(0, slash).toLowerCase()
  if (isRetiredIndependentProvider(provider)) return true
  const id = model.slice(slash + 1).toLowerCase()
  return /(?:^|\/)(?:gemini|grok)(?:[-_.]|$)/.test(id)
}
export function resolveIndependentModel(model: string | undefined): ProviderRoute | null {
  if (!model) return null
  const index = model.indexOf('/')
  if (index < 1 || index === model.length - 1) return null
  const provider = model.slice(0, index).toLowerCase() as IndependentProvider
  if (isRemovedIndependentModel(model) || !Object.hasOwn(PROVIDERS, provider)) return null
  const config = PROVIDERS[provider]
  return {
    provider,
    model: model.slice(index + 1),
    protocol: config.protocol,
    endpoint: config.endpoint,
    ...(config.keyEnvironment ? { keyEnvironment: config.keyEnvironment } : {}),
  }
}
export function getIndependentApiKey(route: ProviderRoute, env: NodeJS.ProcessEnv = process.env): string {
  if (route.provider === 'chatgpt') {
    throw new Error('ChatGPT requires the dedicated OAuth credential manager')
  }
  const key = (route.keyEnvironment && env[route.keyEnvironment]) || readProviderApiKey(route.provider)
  if (!key) throw new Error(`Missing ${route.keyEnvironment ?? 'API key'} for ${route.provider}/${route.model}`)
  return key
}
/** Live provider discovery is the authority for available model names. */
export type IndependentModelDetail = {
  id: string
  contextWindow?: number
  maxOutputTokens?: number
  supportsTools?: boolean
  supportsVision?: boolean
}
function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}
export async function discoverIndependentModelDetails(
  provider: IndependentProvider,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<IndependentModelDetail[]> {
  const addresses: Record<IndependentProvider, string> = {
    openai: 'https://api.openai.com/v1/models',
    chatgpt: 'https://api.openai.com/v1/models',
    deepseek: 'https://api.deepseek.com/models',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    kimi: 'https://api.moonshot.cn/v1/models',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4/models',
    minimax: 'https://api.minimax.io/v1/models',
    openrouter: 'https://openrouter.ai/api/v1/models',
  }
  const response = await fetcher(addresses[provider], {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`Model discovery failed for ${provider}: HTTP ${response.status}`)
  const data = await response.json() as Record<string, unknown>
  const list = provider === 'chatgpt'
    ? (Array.isArray(data.models) ? data.models : data.data)
    : data.data
  if (!Array.isArray(list)) throw new Error(`Invalid model discovery response from ${provider}`)
  return list.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return []
    if (provider === 'chatgpt' && entry.visibility !== undefined && entry.visibility !== 'list') return []
    const value = provider === 'chatgpt'
      ? (typeof entry.slug === 'string' ? entry.slug : entry.id)
      : entry.id
    if (typeof value !== 'string') return []
    const id = value
    if (!id || id.length > 300 || isRemovedIndependentModel(`${provider}/${id}`) ||
        Array.from(id).some(character => character.charCodeAt(0) < 32)) return []
    const top = typeof entry.top_provider === 'object' && entry.top_provider !== null ? entry.top_provider : {}
    const contextWindow = positiveInteger(entry.context_length ?? entry.context_window ?? entry.max_input_tokens)
    const maxOutputTokens = positiveInteger(entry.max_output_tokens ?? entry.max_completion_tokens ?? top.max_completion_tokens)
    const modalities: unknown = entry.architecture?.input_modalities
    const supportsVision = Array.isArray(modalities) ? modalities.includes('image') : undefined
    return [{ id,
      ...(contextWindow ? { contextWindow } : {}),
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      ...(supportsVision !== undefined ? { supportsVision } : {}),
    }]
  })
}
export async function discoverIndependentModels(
  provider: IndependentProvider,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  return (await discoverIndependentModelDetails(provider, token, fetcher)).map(model => model.id)
}
