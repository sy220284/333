/**
 * 333 model registry. Qualified IDs such as openai/gpt-6.1-sol or
 * gemini/gemini-3.8-flash select an independent remote API. Unqualified
 * model IDs keep the existing Anthropic behavior and prompt content.
 */
export type IndependentProvider =
  | 'openai' | 'chatgpt' | 'gemini' | 'xai' | 'deepseek'
  | 'qwen' | 'kimi' | 'zhipu' | 'minimax' | 'openrouter'
export type Protocol = 'responses' | 'chat-completions' | 'gemini'
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
  gemini: { protocol: 'gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta', keyEnvironment: 'GEMINI_API_KEY' },
  xai: { protocol: 'chat-completions', endpoint: 'https://api.x.ai/v1/chat/completions', keyEnvironment: 'XAI_API_KEY' },
  deepseek: { protocol: 'chat-completions', endpoint: 'https://api.deepseek.com/chat/completions', keyEnvironment: 'DEEPSEEK_API_KEY' },
  qwen: { protocol: 'chat-completions', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', keyEnvironment: 'DASHSCOPE_API_KEY' },
  kimi: { protocol: 'chat-completions', endpoint: 'https://api.moonshot.cn/v1/chat/completions', keyEnvironment: 'MOONSHOT_API_KEY' },
  zhipu: { protocol: 'chat-completions', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', keyEnvironment: 'ZHIPU_API_KEY' },
  minimax: { protocol: 'chat-completions', endpoint: 'https://api.minimax.io/v1/chat/completions', keyEnvironment: 'MINIMAX_API_KEY' },
  openrouter: { protocol: 'chat-completions', endpoint: 'https://openrouter.ai/api/v1/chat/completions', keyEnvironment: 'OPENROUTER_API_KEY' },
}
export function resolveIndependentModel(model: string | undefined): ProviderRoute | null {
  if (!model) return null
  const index = model.indexOf('/')
  if (index < 1 || index === model.length - 1) return null
  const provider = model.slice(0, index).toLowerCase() as IndependentProvider
  if (!Object.hasOwn(PROVIDERS, provider)) return null
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
  const key = route.keyEnvironment && env[route.keyEnvironment]
  if (!key) throw new Error(`Missing ${route.keyEnvironment ?? 'API key'} for ${route.provider}/${route.model}`)
  return key
}
export const MODEL_HINTS: Readonly<Record<string, readonly string[]>> = {
  openai: ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna'],
  gemini: ['gemini-3.8-flash'],
}
/** Discovery is account-specific; hints above never override server results. */
export async function discoverIndependentModels(
  provider: IndependentProvider,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  const addresses: Record<IndependentProvider, string> = {
    openai: 'https://api.openai.com/v1/models',
    chatgpt: 'https://api.openai.com/v1/models',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
    xai: 'https://api.x.ai/v1/models',
    deepseek: 'https://api.deepseek.com/models',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    kimi: 'https://api.moonshot.cn/v1/models',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4/models',
    minimax: 'https://api.minimax.io/v1/models',
    openrouter: 'https://openrouter.ai/api/v1/models',
  }
  const url = provider === 'gemini'
    ? `${addresses[provider]}?key=${encodeURIComponent(token)}` : addresses[provider]
  const response = await fetcher(url, {
    headers: provider === 'gemini' ? {} : { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`Model discovery failed for ${provider}: HTTP ${response.status}`)
  const data = await response.json() as Record<string, unknown>
  const list = provider === 'chatgpt' ? data.models : provider === 'gemini' ? data.models : data.data
  if (!Array.isArray(list)) throw new Error(`Invalid model discovery response from ${provider}`)
  return list.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return []
    if (provider === 'chatgpt' && entry.visibility !== 'list') return []
    const value = provider === 'chatgpt' ? entry.slug : provider === 'gemini' ? entry.name : entry.id
    return typeof value === 'string' ? [value.replace(/^models\//, '')] : []
  })
}
