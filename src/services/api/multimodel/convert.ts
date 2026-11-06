/** Protocol-aware request conversion. Preserve incoming prompt text verbatim. */
// biome-ignore lint/suspicious/noExplicitAny: Wire payloads are dynamic before being normalized per provider.
type JSONValue = Record<string, any>
import type { IndependentProvider } from './registry.js'
export type AnthropicRequest = {
  model: string
  messages: Array<{ role: 'user' | 'assistant'; content: string | JSONValue[] }>
  system?: string | JSONValue[]
  tools?: JSONValue[]
  tool_choice?: JSONValue
  max_tokens: number
  temperature?: number
  top_p?: number
  thinking?: JSONValue
  output_config?: JSONValue
  stream?: boolean
  stop_sequences?: string[]
}
const textOf = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(part => {
    if (part && typeof part === 'object' && part.type === 'text') return String(part.text || '')
    if (part && typeof part === 'object' && part.type === 'tool_result') return textOf(part.content)
    return ''
  }).join('\n')
  return content == null ? '' : JSON.stringify(content)
}
function systemText(value: AnthropicRequest['system']): string {
  return textOf(value ?? '')
}
function imageURL(block: JSONValue): string {
  const source = block.source
  if (!source || typeof source !== 'object') throw new Error('Image source missing')
  if (source.type === 'url' && typeof source.url === 'string') return source.url
  if (source.type === 'base64' && typeof source.data === 'string') {
    return `data:${source.media_type || 'image/png'};base64,${source.data}`
  }
  throw new Error('Unsupported image source: expected URL or base64')
}
function allParts(content: string | JSONValue[]): JSONValue[] {
  return typeof content === 'string' ? [{ type: 'text', text: content }] : content
}
function responseInput(parts: JSONValue[]): JSONValue[] {
  return parts.flatMap<JSONValue>(block => {
    if (block.type === 'text') return [{ type: 'input_text', text: String(block.text ?? '') }]
    if (block.type === 'image') return [{ type: 'input_image', image_url: imageURL(block), detail: 'auto' }]
    if (block.type === 'document') {
      if (block.source?.type !== 'base64') throw new Error('Unsupported document source for Responses API')
      return [{ type: 'input_file', filename: 'document.pdf', file_data: `data:${block.source.media_type || 'application/pdf'};base64,${block.source.data}` }]
    }
    if (block.type === 'thinking' || block.type === 'redacted_thinking') return []
    if (block.type === 'tool_result' || block.type === 'tool_use') return []
    throw new Error(`Unsupported Responses content block: ${String(block.type)}`)
  })
}
/** OpenAI Responses API: preserve tool-call IDs and tool results across turns. */
export function toResponses(body: AnthropicRequest, model: string): JSONValue {
  const input: JSONValue[] = []
  for (const message of body.messages) {
    const parts = allParts(message.content)
    let ordinary: JSONValue[] = []
    const flush = () => {
      if (ordinary.length) {
        input.push({ role: message.role, content: ordinary.map(p =>
          message.role === 'assistant' && p.type === 'input_text'
            ? { type: 'output_text', text: p.text } : p) })
        ordinary = []
      }
    }
    for (const block of parts) {
      if (block.type === 'tool_use') {
        flush()
        input.push({ type: 'function_call', call_id: block.id, name: block.name, arguments: JSON.stringify(block.input ?? {}) })
      } else if (block.type === 'tool_result') {
        flush()
        input.push({ type: 'function_call_output', call_id: block.tool_use_id, output: textOf(block.content) })
      } else {
        ordinary.push(...responseInput([block]))
      }
    }
    flush()
  }
  const tools = (body.tools ?? []).map(tool => {
    if (tool.type && tool.type !== 'custom' && tool.type !== 'function') {
      throw new Error(`Unsupported server tool type for Responses API: ${tool.type}`)
    }
    if (!tool.name || !tool.input_schema) throw new Error('Tool requires name and input_schema')
    return { type: 'function', name: tool.name, description: tool.description ?? '', parameters: tool.input_schema, strict: false }
  })
  const result: JSONValue = {
    model, input, instructions: systemText(body.system),
    max_output_tokens: body.max_tokens,
    tools, store: false, stream: Boolean(body.stream),
  }
  const effort = body.output_config?.effort
  if (typeof effort === 'string' && ['low','medium','high','xhigh','max'].includes(effort)) {
    result.reasoning = { effort }
  } else if (body.thinking?.type === 'enabled' || body.thinking?.type === 'adaptive') {
    result.reasoning = { effort: 'high' }
  }
  // Latest GPT reasoning models reject temperature and top_p.
  if (!/^gpt-(?:5|6)/.test(model)) {
    if (body.temperature !== undefined) result.temperature = body.temperature
    if (body.top_p !== undefined) result.top_p = body.top_p
  }
  if (body.tool_choice?.type === 'none') result.tool_choice = 'none'
  if (body.tool_choice?.type === 'any') result.tool_choice = 'required'
  if (body.tool_choice?.type === 'tool') result.tool_choice = { type: 'function', name: body.tool_choice.name }
  return result
}
function chatParts(parts: JSONValue[]): JSONValue[] {
  return parts.flatMap<JSONValue>(block => {
    if (block.type === 'text') return [{ type: 'text', text: String(block.text ?? '') }]
    if (block.type === 'image') return [{ type: 'image_url', image_url: { url: imageURL(block) } }]
    if (block.type === 'thinking' || block.type === 'redacted_thinking') return []
    if (block.type === 'tool_use' || block.type === 'tool_result') return []
    throw new Error(`Unsupported chat content block: ${String(block.type)}`)
  })
}
export function toChatCompletions(body: AnthropicRequest, model: string, provider?: IndependentProvider): JSONValue {
  const messages: JSONValue[] = []
  const system = systemText(body.system)
  if (system) messages.push({ role: 'system', content: system })
  for (const message of body.messages) {
    const parts = allParts(message.content)
    const ordinary = chatParts(parts)
    const reasoningContent = parts.filter(p => p.type === 'thinking' && typeof p.thinking === 'string')
      .map(p => p.thinking as string).join('')
    const calls = parts.filter(p => p.type === 'tool_use').map(p => ({
      id: p.id, type: 'function', function: { name: p.name, arguments: JSON.stringify(p.input ?? {}) },
    }))
    if (ordinary.length || calls.length) {
      messages.push({
        role: message.role,
        content: ordinary.length === 0 ? null : ordinary.length === 1 && ordinary[0].type === 'text'
          ? ordinary[0].text : ordinary,
        ...(calls.length ? { tool_calls: calls } : {}),
        ...(reasoningContent && (provider === 'deepseek' || provider === 'qwen' || provider === 'kimi')
          ? { reasoning_content: reasoningContent } : {}),
      })
    }
    for (const result of parts.filter(p => p.type === 'tool_result')) {
      messages.push({ role: 'tool', tool_call_id: result.tool_use_id, content: textOf(result.content) })
    }
  }
  const tools = (body.tools ?? []).map(t => {
    if (t.type && t.type !== 'custom' && t.type !== 'function') throw new Error(`Unsupported chat tool type: ${t.type}`)
    return { type: 'function', function: { name: t.name, description: t.description ?? '', parameters: t.input_schema } }
  })
  const result: JSONValue = {
    model, messages, max_tokens: body.max_tokens, stream: Boolean(body.stream),
  }
  if (tools.length) result.tools = tools
  if (body.temperature !== undefined) result.temperature = body.temperature
  if (body.top_p !== undefined) result.top_p = body.top_p
  if (body.stop_sequences?.length) result.stop = body.stop_sequences
  if (body.tool_choice?.type === 'none') result.tool_choice = 'none'
  if (body.tool_choice?.type === 'any') result.tool_choice = 'required'
  if (body.tool_choice?.type === 'tool') result.tool_choice = { type: 'function', function: { name: body.tool_choice.name } }
  const requestedEffort = body.output_config?.effort
  const effort = typeof requestedEffort === 'string' &&
    ['low', 'medium', 'high', 'xhigh', 'max'].includes(requestedEffort)
    ? requestedEffort : undefined
  const thinking = body.thinking?.type
  if (provider === 'deepseek') {
    if (thinking === 'enabled' || thinking === 'adaptive') result.thinking = { type: 'enabled' }
    if (thinking === 'disabled') result.thinking = { type: 'disabled' }
    if (effort) result.reasoning_effort = effort === 'medium' || effort === 'xhigh' ? 'high' : effort
  } else if (provider === 'qwen' && /^qwen3/i.test(model)) {
    if (thinking === 'enabled' || thinking === 'adaptive') result.enable_thinking = true
    if (thinking === 'disabled') result.enable_thinking = false
  } else if (provider === 'openrouter') {
    if (effort) result.reasoning = { effort }
    else if (thinking === 'disabled') result.reasoning = { effort: 'none' }
    else if (thinking === 'enabled' || thinking === 'adaptive') result.reasoning = { effort: 'high' }
  }
  // Explicitly request the terminal usage chunk where the provider supports it.
  if (body.stream && (provider === 'deepseek' || provider === 'openrouter')) {
    result.stream_options = { include_usage: true }
  }
  return result
}
