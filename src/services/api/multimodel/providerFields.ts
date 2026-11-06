/**
 * Official API wire-field policy for 333's remote Chat Completions providers.
 * The model list is discovered at runtime; only documented protocol differences
 * are version-gated here. Never invent an unsupported parameter for a model.
 */
import type { IndependentProvider } from './registry.js'
import { getIndependentProfile } from './profiles.js'

export type ModelFieldProfile = {
  protocol: 'responses' | 'chat-completions'
  thinkingField: 'reasoning' | 'reasoning_effort' | 'thinking' | 'enable_thinking' | 'none'
  supportedEffort: readonly string[]
  alwaysThinking: boolean
  replayReasoning: boolean
  outputTokenField: 'max_output_tokens' | 'max_tokens' | 'max_completion_tokens'
  usageInStream: boolean
}

/** Inspectable, model-specific capabilities used by the request encoder and tests. */
function getBuiltinModelFieldProfile(provider: IndependentProvider, model: string): ModelFieldProfile {
  const id = model.toLowerCase()
  const common = { protocol: 'chat-completions' as const, outputTokenField: 'max_tokens' as const,
    usageInStream: false, replayReasoning: true }
  if (provider === 'openai' || provider === 'chatgpt') return {
    protocol: 'responses', thinkingField: 'reasoning', supportedEffort: ['low', 'medium', 'high', 'xhigh', 'max'],
    alwaysThinking: false, replayReasoning: true, outputTokenField: 'max_output_tokens', usageInStream: true,
  }
  if (provider === 'deepseek') return { ...common, thinkingField: 'thinking',
    supportedEffort: ['low', 'high', 'max'], alwaysThinking: false, usageInStream: true }
  if (provider === 'qwen') return { ...common, thinkingField: 'enable_thinking',
    supportedEffort: /^qwen3\.8/.test(id) ? ['low', 'medium', 'xhigh'] : [],
    alwaysThinking: /^qwen3\.8-2\.4t-a95b/.test(id), usageInStream: true }
  if (provider === 'zhipu') return { ...common, thinkingField: 'thinking',
    supportedEffort: /^glm-5\.3/.test(id) ? ['low', 'high', 'max'] :
      /^glm-5\.[12]/.test(id) ? ['high', 'max'] : [],
    alwaysThinking: /^glm-5\.3/.test(id), usageInStream: true }
  if (provider === 'kimi') {
    const isK3 = /^kimi-k3(?:\.|$|-)/.test(id)
    const isK28 = /^kimi-k2\.8/.test(id)
    return { ...common, thinkingField: isK3 || isK28 ? 'reasoning_effort' : 'thinking',
      supportedEffort: isK3 || isK28 ? ['low', 'high', 'max'] : [],
      alwaysThinking: isK3 || isK28 || /^kimi-k2\.7-code/.test(id), usageInStream: true }
  }
  if (provider === 'minimax') {
    const m31 = /^minimax-m3\.1/.test(id)
    return { ...common, thinkingField: m31 ? 'reasoning_effort' : 'thinking',
      supportedEffort: m31 ? ['low', 'medium', 'high', 'xhigh', 'max'] : [],
      alwaysThinking: m31 || /^minimax-m2\./.test(id),
      outputTokenField: m31 ? 'max_completion_tokens' : 'max_tokens',
      usageInStream: true }
  }
  return { ...common, thinkingField: 'reasoning', supportedEffort: ['low', 'medium', 'high', 'xhigh', 'max'],
    alwaysThinking: false, usageInStream: true }
}

/** Live model metadata takes precedence over version-based heuristics. */
export function getModelFieldProfile(provider: IndependentProvider, model: string): ModelFieldProfile {
  const base = getBuiltinModelFieldProfile(provider, model)
  const discovered = getIndependentProfile(`${provider}/${model}`)
  if (!discovered?.supportedEffort) return base
  return { ...base, supportedEffort: discovered.supportedEffort }
}

// biome-ignore lint/suspicious/noExplicitAny: Provider wire payloads are heterogeneous before validation.
type Wire = Record<string, any>
type ChatFields = {
  provider?: IndependentProvider
  model: string
  thinking?: string
  effort?: string
  stream: boolean
}

/** Apply vendor fields only after generic messages and tools are encoded. */
export function applyChatModelFields(result: Wire, { provider, model, thinking, effort, stream }: ChatFields): void {
  if (!provider) return
  const profile = getModelFieldProfile(provider, model)
  const id = model.toLowerCase()
  const enabled = thinking === 'enabled' || thinking === 'adaptive'
  const disabled = thinking === 'disabled'
  if (disabled && profile.alwaysThinking) {
    if (provider === 'zhipu') throw new Error('GLM-5.3 系列始终启用思考；请选择 low 推理强度代替关闭')
    if (provider === 'kimi') throw new Error('Kimi K2.7 Code / K3 系列不支持关闭思考')
    throw new Error('当前 MiniMax 模型必须保留推理能力；可通过 effort 降低强度')
  }
  if (disabled && effort) {
    throw new Error('已关闭思考，但同时指定了推理强度；请仅保留一项配置')
  }

  if (provider === 'deepseek') {
    if (enabled) result.thinking = { type: 'enabled' }
    if (disabled) result.thinking = { type: 'disabled' }
    if (effort) result.reasoning_effort = effort === 'medium' || effort === 'xhigh'
      ? 'high' : effort
    // DeepSeek V4 enables thinking by default; in this mode its API rejects
    // required/named tool choices. Do not silently degrade a forced tool call.
    if (!disabled && (result.tool_choice === 'required' ||
      (result.tool_choice && typeof result.tool_choice === 'object'))) {
      throw new Error('DeepSeek 思考模式仅支持 tool_choice=auto/none；请关闭思考后指定工具')
    }
    if (!disabled) {
      delete result.temperature
      if (/^deepseek-v4-pro/.test(id)) delete result.top_p
    }
  } else if (provider === 'qwen') {
    if (/^qwen3/.test(id)) {
      if (enabled) result.enable_thinking = true
      if (disabled) result.enable_thinking = false
      if (effort && /^qwen3\.8/.test(id)) {
        result.reasoning_effort = effort === 'low' ? 'low'
          : effort === 'medium' ? 'medium' : 'xhigh'
      }
      // Qwen 3.8 includes prior reasoning in the context; returning it in a
      // separate field prevents invalid concatenation into content.
      if (/^qwen3\.8/.test(id) && !disabled) result.preserve_thinking = true
    }
  } else if (provider === 'zhipu') {
    if (enabled || profile.alwaysThinking) result.thinking = { type: 'enabled' }
    if (disabled) result.thinking = { type: 'disabled' }
    if (effort && profile.supportedEffort.length) {
      result.reasoning_effort = /^glm-5\.3/.test(id)
        ? (effort === 'low' ? 'low' : effort === 'max' || effort === 'xhigh' ? 'max' : 'high')
        : (effort === 'max' || effort === 'xhigh' ? 'max' : 'high')
    }
  } else if (provider === 'minimax') {
    if (/^minimax-m3\.1/.test(id)) {
      result.reasoning_split = true
      result.max_completion_tokens = result.max_tokens
      delete result.max_tokens
      if (effort) result.reasoning_effort = effort
      // M3.1 always thinks. Sending a legacy "thinking" object adds no value.
    } else {
      if (enabled) result.thinking = { type: 'adaptive' }
      if (disabled) result.thinking = { type: 'disabled' }
      if (/^minimax-m3(?:-|$)/.test(id)) result.reasoning_split = true
    }
  } else if (provider === 'kimi') {
    if (profile.thinkingField === 'reasoning_effort') {
      if (effort) {
        // Direct Moonshot K3.1 Pro supports low/high/max; hosted gateways
        // may expose a narrower set and must be profiled separately.
        result.reasoning_effort = effort === 'medium' ? 'high'
          : effort === 'xhigh' ? 'max' : effort
      }
      // K3 and K3.1 fix sampler values server-side; sending overrides may
      // make a valid reasoning request fail.
      delete result.temperature
      delete result.top_p
    } else if (/^kimi-k2\.7-code/.test(id)) {
      // Direct Moonshot K2.7 Code always reasons and rejects the thinking
      // and reasoning_effort fields entirely.
      delete result.thinking
      delete result.reasoning_effort
      delete result.temperature
      delete result.top_p
    } else {
      if (enabled) result.thinking = { type: 'enabled' }
      if (disabled) result.thinking = { type: 'disabled' }
      // K2.6 is the Moonshot revision that supports retaining all prior
      // reasoning explicitly with thinking.keep.
      if (/^kimi-k2\.6/.test(id) && enabled) result.thinking.keep = 'all'
    }
    if (result.tool_choice && typeof result.tool_choice === 'object' && /^kimi-k2/.test(id)) {
      result.tool_choice = 'auto'
    }
  } else if (provider === 'openrouter') {
    if (effort) result.reasoning = { effort }
    else if (disabled) result.reasoning = { effort: 'none' }
    else if (enabled) result.reasoning = { effort: 'high' }
    if (result.reasoning && result.reasoning.effort !== 'none') result.include_reasoning = true
  }
  if (stream && profile.usageInStream) result.stream_options = { include_usage: true }
}
