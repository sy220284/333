/** Protocol-aware request conversion. Preserve incoming prompt text verbatim. */
type JSONValue = Record<string, any>
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
function resolveToolNames(messages: AnthropicRequest['messages']): Map<string,string> {
  const names = new Map<string,string>()
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue
    for (const part of message.content) {
      if (part.type === 'tool_use' && typeof part.id === 'string' && typeof part.name === 'string') {
        names.set(part.id, part.name)
      }
    }
  }
  return names
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
  return parts.flatMap(block => {
    if (block.type === 'text') return [{ type: 'text', text: String(block.text ?? '') }]
    if (block.type === 'image') return [{ type: 'image_url', image_url: { url: imageURL(block) } }]
    if (block.type === 'thinking' || block.type === 'redacted_thinking') return []
    if (block.type === 'tool_use' || block.type === 'tool_result') return []
    throw new Error(`Unsupported chat content block: ${String(block.type)}`)
  })
}
export function toChatCompletions(body: AnthropicRequest, model: string): JSONValue {
  const messages: JSONValue[] = []
  const system = systemText(body.system)
  if (system) messages.push({ role: 'system', content: system })
  for (const message of body.messages) {
    const parts = allParts(message.content)
    const ordinary = chatParts(parts)
    const calls = parts.filter(p => p.type === 'tool_use').map(p => ({
      id: p.id, type: 'function', function: { name: p.name, arguments: JSON.stringify(p.input ?? {}) },
    }))
    if (ordinary.length || calls.length) {
      messages.push({
        role: message.role,
        content: ordinary.length === 0 ? null : ordinary.length === 1 && ordinary[0].type === 'text'
          ? ordinary[0].text : ordinary,
        ...(calls.length ? { tool_calls: calls } : {}),
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
  return result
}
export function toGemini(body: AnthropicRequest): JSONValue {
  const names = resolveToolNames(body.messages)
  const contents: JSONValue[] = []
  for (const message of body.messages) {
    const parts = allParts(message.content).flatMap<JSONValue>(block => {
      if (block.type === 'text') return [{ text: String(block.text ?? '') }]
      if (block.type === 'image') {
        const source = block.source
        if (source?.type !== 'base64') throw new Error('Gemini image requires base64 source')
        return [{ inlineData: { mimeType: source.media_type, data: source.data } }]
      }
      if (block.type === 'document') {
        const source = block.source
        if (source?.type !== 'base64') throw new Error('Gemini document requires base64 source')
        return [{ inlineData: { mimeType: source.media_type, data: source.data } }]
      }
      if (block.type === 'tool_use') return [{ functionCall: { name: block.name, args: block.input ?? {} } }]
      if (block.type === 'tool_result') return [{
        functionResponse: { name: names.get(block.tool_use_id) ?? block.tool_use_id, response: { output: textOf(block.content) } },
      }]
      if (block.type === 'thinking' || block.type === 'redacted_thinking') return []
      throw new Error(`Unsupported Gemini content block: ${String(block.type)}`)
    })
    if (parts.length) contents.push({ role: message.role === 'assistant' ? 'model' : 'user', parts })
  }
  const out: JSONValue = {
    contents,
    generationConfig: { maxOutputTokens: body.max_tokens },
  }
  const system = systemText(body.system)
  if (system) out.systemInstruction = { parts: [{ text: system }] }
  if (body.temperature !== undefined) out.generationConfig.temperature = body.temperature
  if (body.top_p !== undefined) out.generationConfig.topP = body.top_p
  if (body.stop_sequences?.length) out.generationConfig.stopSequences = body.stop_sequences
  if (body.tools?.length) out.tools = [{
    functionDeclarations: body.tools.map(t => {
      if (t.type && t.type !== 'custom' && t.type !== 'function') throw new Error(`Unsupported Gemini server tool: ${t.type}`)
      return { name: t.name, description: t.description ?? '', parametersJsonSchema: t.input_schema }
    }),
  }]
  if (body.tool_choice?.type === 'none') out.toolConfig = { functionCallingConfig: { mode: 'NONE' } }
  if (body.tool_choice?.type === 'any') out.toolConfig = { functionCallingConfig: { mode: 'ANY' } }
  if (body.tool_choice?.type === 'tool') {
    out.toolConfig = { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [body.tool_choice.name] } }
  }
  return out
}
