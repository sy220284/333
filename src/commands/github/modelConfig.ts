/**
 * Repository-hosted AI calls use their own GitHub Actions credential.
 * Reading the existing local model inventory does not upload or persist secrets.
 */
import { getSavedModelOptions } from '../../services/api/multimodel/catalog.js'
import { getIndependentApiKey, resolveIndependentModel } from '../../services/api/multimodel/registry.js'
import { getAnthropicApiKey } from '../../utils/auth.js'
import { getMainLoopModel } from '../../utils/model/model.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { validRepository } from './repository.js'

export type GithubModelOption = {
  id: string
  label: string
  model: string
  protocol: 'openai-compatible' | 'openai-responses' | 'anthropic'
  endpoint: string
  tokenField: 'max_tokens' | 'max_completion_tokens'
  credentialSource: string
}
function configuredClaudeKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || getAnthropicApiKey() || undefined
}
export function getGithubModelOptions(): GithubModelOption[] {
  const models: GithubModelOption[] = []
  const claude = getMainLoopModel()
  if (configuredClaudeKey() && typeof claude === 'string' && !claude.includes('/')) {
    models.push({
      id: `claude/${claude}`, label: `Claude · ${claude}`, model: claude,
      protocol: 'anthropic', endpoint: 'https://api.anthropic.com/v1/messages',
      tokenField: 'max_tokens', credentialSource: '已配置的 Anthropic API Key',
    })
  }
  const known = getSavedModelOptions()
  // A selected API model remains usable even if its discovery cache has not
  // been refreshed yet; the model ID and credential come from the live session.
  if (typeof claude === 'string' && claude.includes('/') &&
      !known.some(entry => entry.value === claude)) {
    known.unshift({value:claude,label:claude.split('/').slice(1).join('/'),
      description:`${claude} · 当前使用模型`})
  }
  for (const saved of known) {
    const route = resolveIndependentModel(saved.value)
    // ChatGPT OAuth is account-scoped interactive authorization and cannot be
    // exported or reused as the Actions unattended API credential.
    if (!route || route.provider === 'chatgpt') continue
    let key: string
    try { key = getIndependentApiKey(route) } catch (error) {
      if (error instanceof Error && /^Missing /.test(error.message)) continue
      throw error
    }
    if (!key) continue
    models.push({
      id: saved.value, label: saved.description,
      model: route.model,
      protocol: route.protocol === 'responses' ? 'openai-responses' : 'openai-compatible',
      endpoint: route.endpoint,
      tokenField: route.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens',
      credentialSource: `本机 ${route.provider} API Key`,
    })
  }
  return models
}
export function getGithubModelOption(id: string): GithubModelOption {
  const option = getGithubModelOptions().find(model => model.id === id)
  if (!option) {
    if (id.startsWith('chatgpt/')) {
      throw new Error('ChatGPT OAuth 仅用于本机交互。GitHub Actions 需单独配置 OpenAI API Key。')
    }
    throw new Error('所选模型未在摇摇车本机凭据中配置，请先通过 /model 配置 API 模型。')
  }
  return option
}
function resolveKey(choice: GithubModelOption): string {
  if (choice.protocol === 'anthropic') {
    const key = configuredClaudeKey()
    if (!key) throw new Error('未配置 Anthropic API Key')
    return key
  }
  const route = resolveIndependentModel(choice.id)
  if (!route || route.provider === 'chatgpt') throw new Error('Actions 模型凭据类型不兼容')
  return getIndependentApiKey(route)
}
async function gh(args: string[], input?: string): Promise<void> {
  const response = await execFileNoThrow('gh', args, {
    timeout: 60000, useCwd: true, preserveOutputOnError: true, input,
  })
  if (response.code !== 0) throw new Error('GitHub Actions 配置失败：' +
    (response.stderr || response.error || '未知原因').slice(0,800))
}
/**
 * Consent is mandatory: the user has to explicitly approve copying a locally
 * saved key into GitHub Actions Secrets. Never expose it in argv or output.
 */
export async function configureGithubModel(
  rawRepo: string, id: string, explicitConsent: boolean,
): Promise<string> {
  if (!explicitConsent) throw new Error('需要明确确认后才能向 GitHub Actions 上传 API Key')
  const repo = validRepository(rawRepo)
  const option = getGithubModelOption(id)
  const key = resolveKey(option)
  await gh(['auth', 'status', '-h', 'github.com'])
  // Write the secret before making the new model configuration visible.
  // All subsequent steps are idempotent and can be retried after a failure.
  await gh(['secret', 'set', 'YAOYAOCHE_MODEL_API_KEY', '--repo', repo], key)
  const variables = {
    YAOYAOCHE_MODEL_PROVIDER: option.protocol,
    YAOYAOCHE_MODEL_NAME: option.model,
    YAOYAOCHE_MODEL_BASE_URL: option.endpoint,
    YAOYAOCHE_MODEL_TOKEN_FIELD: option.tokenField,
  }
  for (const [name, value] of Object.entries(variables)) {
    await gh(['variable', 'set', name, '--repo', repo, '--body', value])
  }
  return `仓库 ${repo} 已单独配置 Actions 模型 ${option.id}；本机授权状态及本地凭据文件未修改。`
}

export type GithubActionsProvider = 'openai' | 'deepseek' | 'qwen' | 'kimi' |
  'zhipu' | 'minimax' | 'anthropic'
export function getGithubActionsProviderOptions(): Array<{value: GithubActionsProvider; label: string}> {
  return [
    {value:'openai',label:'OpenAI API'},
    {value:'deepseek',label:'DeepSeek'},
    {value:'qwen',label:'通义千问 Qwen'},
    {value:'kimi',label:'Kimi / Moonshot'},
    {value:'zhipu',label:'智谱 GLM'},
    {value:'minimax',label:'MiniMax'},
    {value:'anthropic',label:'Claude / Anthropic API（可选）'},
  ]
}
/**
 * Setup a new unattended Actions-only credential without writing it into the
 * local model vault. Used when a provider account is not configured locally.
 */
export async function configureGithubCustomModel(
  rawRepo: string, provider: GithubActionsProvider, model: string, apiKey: string,
  explicitConsent: boolean,
): Promise<string> {
  if(!explicitConsent) throw new Error('用户须明确授权将密钥上传到指定 GitHub 仓库')
  const repo=validRepository(rawRepo)
  const supported=getGithubActionsProviderOptions()
  if(!supported.some(item=>item.value===provider))throw new Error('模型服务商不支持')
  if(!/^[A-Za-z0-9_./:-]{1,180}$/.test(model))throw new Error('模型名称格式无效')
  if(apiKey.length<5 || apiKey.length>8192 || apiKey.trim()!==apiKey ||
    Array.from(apiKey).some(char => char.charCodeAt(0) < 32)) throw new Error('API Key 格式无效')
  const option=provider==='anthropic'
    ? {protocol:'anthropic',endpoint:'https://api.anthropic.com/v1/messages',tokenField:'max_tokens'}
    : (() => {
      const route=resolveIndependentModel(`${provider}/${model}`)
      if(!route||route.provider==='chatgpt')throw new Error('模型路由不存在')
      return {protocol:route.protocol==='responses'?'openai-responses':'openai-compatible',
        endpoint:route.endpoint,tokenField:provider==='openai'?'max_completion_tokens':'max_tokens'}
    })()
  await gh(['auth','status','-h','github.com'])
  await gh(['secret','set','YAOYAOCHE_MODEL_API_KEY','--repo',repo],apiKey)
  const variables = {
    YAOYAOCHE_MODEL_PROVIDER: option.protocol,
    YAOYAOCHE_MODEL_NAME: model,
    YAOYAOCHE_MODEL_BASE_URL: option.endpoint,
    YAOYAOCHE_MODEL_TOKEN_FIELD: option.tokenField,
  }
  for(const [name,value] of Object.entries(variables)) {
    await gh(['variable','set',name,'--repo',repo,'--body',value])
  }
  return `GitHub Actions 已单独配置 ${provider}/${model}；本机模型账号及密钥未改变。`
}

/** 统一选择器的已保存模型和新建模型分流；上传前不依赖另一模式的状态。 */
export type GithubWizardModelSelection =
  | { kind: 'saved'; id: string }
  | { kind: 'new'; provider: GithubActionsProvider; model: string; apiKey: string }

export async function configureGithubWizardModel(
  repo: string, selected: GithubWizardModelSelection, explicitConsent: boolean,
): Promise<string> {
  if (selected.kind === 'new') {
    return configureGithubCustomModel(repo, selected.provider, selected.model, selected.apiKey, explicitConsent)
  }
  return configureGithubModel(repo, selected.id, explicitConsent)
}
