import { randomUUID } from 'node:crypto'
import type { ProviderRoute } from './registry.js'
import { getIndependentApiKey } from './registry.js'
import { type AnthropicRequest, toResponses, toChatCompletions, toGemini } from './convert.js'

type ObjectValue = Record<string, any>

function asError(status: number, message: string): Response {
  const type = status === 400 ? 'invalid_request_error'
    : status === 401 || status === 403 ? 'authentication_error'
    : status === 404 ? 'not_found_error'
    : status === 429 ? 'rate_limit_error' : 'api_error'
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status, headers: { 'content-type': 'application/json' },
  })
}
function usageFrom(value: ObjectValue | undefined): ObjectValue {
  if (!value) return { input_tokens: 0, output_tokens: 0 }
  return {
    input_tokens: value.input_tokens ?? value.prompt_tokens ?? value.promptTokenCount ?? 0,
    output_tokens: value.output_tokens ?? value.completion_tokens ?? value.candidatesTokenCount ?? 0,
    cache_read_input_tokens: value.input_tokens_details?.cached_tokens ?? 0,
  }
}
class AnthropicEvents {
  private index = 0
  private open: number | null = null
  private activeType: 'text' | 'tool' | null = null
  private hasTools = false
  private usage: ObjectValue = { input_tokens: 0, output_tokens: 0 }
  constructor(private readonly model: string, private readonly emit: (event: ObjectValue) => void) {
    this.emit({ type: 'message_start', message: {
      id: `msg_${randomUUID().replaceAll('-', '')}`, type: 'message', role: 'assistant',
      model, content: [], stop_reason: null, stop_sequence: null, usage: this.usage,
    } })
  }
  setUsage(value: ObjectValue | undefined): void { this.usage = usageFrom(value) }
  private stopBlock(): void {
    if (this.open !== null) {
      this.emit({ type: 'content_block_stop', index: this.open })
      this.open = null
      this.activeType = null
    }
  }
  text(delta: string): void {
    if (!delta) return
    if (this.activeType !== 'text') {
      this.stopBlock()
      this.open = this.index++
      this.activeType = 'text'
      this.emit({ type: 'content_block_start', index: this.open, content_block: { type: 'text', text: '' } })
    }
    this.emit({ type: 'content_block_delta', index: this.open, delta: { type: 'text_delta', text: delta } })
  }
  tool(name: string, id: string, argumentsJson: string): void {
    this.stopBlock()
    this.hasTools = true
    const index = this.index++
    this.emit({ type: 'content_block_start', index, content_block: {
      type: 'tool_use', id: id || `toolu_${randomUUID().replaceAll('-', '')}`, name, input: {},
    } })
    this.emit({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: argumentsJson || '{}' } })
    this.emit({ type: 'content_block_stop', index })
  }
  finish(): void {
    this.stopBlock()
    this.emit({ type: 'message_delta', delta: {
      stop_reason: this.hasTools ? 'tool_use' : 'end_turn', stop_sequence: null,
    }, usage: { output_tokens: this.usage.output_tokens } })
    this.emit({ type: 'message_stop' })
  }
}
async function* sseMessages(stream: ReadableStream<Uint8Array>): AsyncGenerator<ObjectValue | '[DONE]'> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let data: string[] = []
  const pushLine = (line: string): string | undefined => {
    if (line === '') {
      const payload = data.join('\n')
      data = []
      return payload || undefined
    }
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
    return undefined
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      let pos: number
      while ((pos = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, pos).replace(/\r$/, '')
        buffer = buffer.slice(pos + 1)
        const payload = pushLine(line)
        if (!payload) continue
        if (payload === '[DONE]') { yield '[DONE]'; continue }
        yield JSON.parse(payload) as ObjectValue
      }
      if (done) break
    }
    if (buffer) {
      const payload = pushLine(buffer.replace(/\r$/, ''))
      if (payload) yield payload === '[DONE]' ? '[DONE]' : JSON.parse(payload) as ObjectValue
    }
    const last = pushLine('')
    if (last) yield last === '[DONE]' ? '[DONE]' : JSON.parse(last) as ObjectValue
  } finally {
    reader.releaseLock()
  }
}
function emitFromResponses(
  data: ObjectValue, events: AnthropicEvents,
  state: { text: boolean; completed: boolean; tool: Map<number, ObjectValue> },
): void {
  const type = data.type
  if (type === 'response.output_text.delta') {
    events.text(String(data.delta ?? ''))
    state.text = true
  } else if (type === 'response.output_item.added' && data.item?.type === 'function_call') {
    state.tool.set(Number(data.output_index ?? 0), {
      id: data.item.call_id, name: data.item.name, arguments: '',
    })
  } else if (type === 'response.function_call_arguments.delta') {
    const index = Number(data.output_index ?? 0)
    const item = state.tool.get(index) ?? { id: '', name: '', arguments: '' }
    item.arguments += String(data.delta ?? '')
    state.tool.set(index, item)
  } else if (type === 'response.output_item.done' && data.item?.type === 'function_call') {
    const index = Number(data.output_index ?? 0)
    const previous = state.tool.get(index) ?? {}
    state.tool.set(index, {
      id: data.item.call_id ?? previous.id,
      name: data.item.name ?? previous.name,
      arguments: data.item.arguments ?? previous.arguments ?? '{}',
    })
  } else if (type === 'response.completed') {
    state.completed = true
    const response = data.response ?? {}
    events.setUsage(response.usage)
    if (!state.text) {
      for (const item of response.output ?? []) {
        if (item.type === 'message') {
          for (const part of item.content ?? []) if (part.type === 'output_text') events.text(String(part.text ?? ''))
        }
      }
    }
    for (const item of response.output ?? []) {
      if (item.type !== 'function_call') continue
      const exists = [...state.tool.values()].some(t => t.id === item.call_id)
      if (!exists) state.tool.set(state.tool.size, { id: item.call_id, name: item.name, arguments: item.arguments ?? '{}' })
    }
    for (const item of state.tool.values()) {
      if (!item.name) throw new Error('Responses returned a tool call without a name')
      events.tool(item.name, item.id, item.arguments || '{}')
    }
  } else if (type === 'response.failed' || type === 'response.incomplete') {
    throw new Error(`Responses ${type}: ${JSON.stringify(data.response?.error ?? data.response?.incomplete_details ?? {})}`)
  } else if (type === 'error') {
    throw new Error(`Responses stream error: ${JSON.stringify(data.error ?? data)}`)
  }
}
function emitFromChat(
  data: ObjectValue, events: AnthropicEvents,
  state: { completed: boolean; calls: Map<number, ObjectValue> },
): void {
  if (data.error) throw new Error(`Chat completion error: ${JSON.stringify(data.error)}`)
  if (data.usage) events.setUsage(data.usage)
  for (const choice of data.choices ?? []) {
    const delta = choice.delta ?? {}
    if (typeof delta.content === 'string') events.text(delta.content)
    for (const call of delta.tool_calls ?? []) {
      const index = Number(call.index ?? 0)
      const found = state.calls.get(index) ?? { id: '', name: '', arguments: '' }
      if (call.id) found.id = call.id
      if (call.function?.name) found.name = call.function.name
      if (call.function?.arguments) found.arguments += call.function.arguments
      state.calls.set(index, found)
    }
    if (choice.finish_reason) state.completed = true
  }
}
function emitFromGemini(
  data: ObjectValue, events: AnthropicEvents,
  state: { completed: boolean; calls: Array<ObjectValue> },
): void {
  if (data.error) throw new Error(`Gemini stream error: ${JSON.stringify(data.error)}`)
  if (data.usageMetadata) events.setUsage(data.usageMetadata)
  for (const candidate of data.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (typeof part.text === 'string') events.text(part.text)
      if (part.functionCall) state.calls.push({
        name: part.functionCall.name,
        id: `toolu_${randomUUID().replaceAll('-', '')}`,
        arguments: JSON.stringify(part.functionCall.args ?? {}),
      })
    }
    if (candidate.finishReason) state.completed = true
  }
}
function materializeResponse(body: ObjectValue, route: ProviderRoute): ObjectValue {
  const content: ObjectValue[] = []
  const usage = route.protocol === 'gemini' ? usageFrom(body.usageMetadata) : usageFrom(body.usage)
  if (route.protocol === 'responses') {
    for (const item of body.output ?? []) {
      if (item.type === 'message') {
        for (const part of item.content ?? []) if (part.type === 'output_text') content.push({ type: 'text', text: part.text ?? '' })
      }
      if (item.type === 'function_call') content.push({
        type: 'tool_use', id: item.call_id, name: item.name, input: JSON.parse(item.arguments || '{}'),
      })
    }
  } else if (route.protocol === 'chat-completions') {
    const message = body.choices?.[0]?.message
    if (message?.content) content.push({ type: 'text', text: message.content })
    for (const call of message?.tool_calls ?? []) content.push({
      type: 'tool_use', id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments || '{}'),
    })
  } else {
    for (const part of body.candidates?.[0]?.content?.parts ?? []) {
      if (part.text) content.push({ type: 'text', text: part.text })
      if (part.functionCall) content.push({
        type: 'tool_use', id: `toolu_${randomUUID().replaceAll('-', '')}`,
        name: part.functionCall.name, input: part.functionCall.args ?? {},
      })
    }
  }
  return {
    id: body.id ?? `msg_${randomUUID().replaceAll('-', '')}`, type: 'message', role: 'assistant',
    model: route.model, content,
    stop_reason: content.some(x => x.type === 'tool_use') ? 'tool_use' : 'end_turn',
    stop_sequence: null, usage,
  }
}
/**
 * Fetch bridge operates at the existing Anthropic SDK transport boundary.
 * No provider credentials or telemetry reach the original Anthropic API.
 */
export function makeIndependentFetch(
  route: ProviderRoute, bearer: string, upstream: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init)
    if (!request.url.startsWith('https://333-model-bridge.invalid/')) {
      throw new Error('Independent model bridge received an unexpected SDK endpoint')
    }
    const body = await request.json() as AnthropicRequest
    if (body.model !== `${route.provider}/${route.model}`) {
      throw new Error('Independent model bridge request model changed unexpectedly')
    }
    const payload = route.protocol === 'responses' ? toResponses(body, route.model)
      : route.protocol === 'gemini' ? toGemini(body) : toChatCompletions(body, route.model)
    // Plan-sharing OAuth strictly requires streaming even for validation calls.
    if (route.provider === 'chatgpt') payload.stream = true
    const endpoint = route.protocol === 'gemini'
      ? `${route.endpoint}/models/${encodeURIComponent(route.model)}:${body.stream ? 'streamGenerateContent?alt=sse&' : 'generateContent?'}key=${encodeURIComponent(bearer)}`
      : route.endpoint
    const headers = new Headers({ 'content-type': 'application/json' })
    if (route.protocol !== 'gemini') headers.set('Authorization', `Bearer ${bearer}`)
    const signal = init?.signal ?? request.signal
    const response = await upstream(endpoint, {
      method: 'POST', headers, body: JSON.stringify(payload), signal,
    })
    if (!response.ok) {
      const detail = await response.text()
      return asError(response.status, `${route.provider} HTTP ${response.status}: ${detail.slice(0, 1500)}`)
    }
    if (!response.body) return asError(502, `${route.provider} returned empty response`)
    if (!body.stream && route.provider !== 'chatgpt') {
      return new Response(JSON.stringify(materializeResponse(await response.json() as ObjectValue, route)), {
        headers: { 'content-type': 'application/json' },
      })
    }
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (value: ObjectValue) => controller.enqueue(encoder.encode(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`))
        const events = new AnthropicEvents(route.model, emit)
        const rstate = { completed: false, text: false, tool: new Map<number, ObjectValue>() }
        const cstate = { completed: false, calls: new Map<number, ObjectValue>() }
        const gstate = { completed: false, calls: [] as ObjectValue[] }
        try {
          for await (const chunk of sseMessages(response.body!)) {
            if (chunk === '[DONE]') continue
            if (route.protocol === 'responses') emitFromResponses(chunk, events, rstate)
            else if (route.protocol === 'chat-completions') emitFromChat(chunk, events, cstate)
            else emitFromGemini(chunk, events, gstate)
          }
          if (route.protocol === 'responses' && !rstate.completed) throw new Error('Responses ended without response.completed')
          if (route.protocol === 'chat-completions' && !cstate.completed) throw new Error('Chat stream ended without a finish_reason')
          if (route.protocol === 'gemini' && !gstate.completed) throw new Error('Gemini stream ended without a finishReason')
          for (const call of cstate.calls.values()) {
            if (!call.name) throw new Error('Chat stream returned tool call with no name')
            events.tool(call.name, call.id, call.arguments || '{}')
          }
          for (const call of gstate.calls) events.tool(call.name, call.id, call.arguments)
          events.finish()
          controller.close()
        } catch (error) { controller.error(error) }
      },
    })
    if (!body.stream && route.provider === 'chatgpt') {
      // The upstream plan always streams; the existing SDK may request a single message.
      // Convert the Anthropic SSE back into its assembled message at this boundary.
      const chunks: ObjectValue[] = []
      for await (const item of sseMessages(stream)) if (item !== '[DONE]') chunks.push(item)
      const message = chunks.find(e => e.type === 'message_start')?.message ?? {}
      const blocks: ObjectValue[] = []
      let partial = ''
      let block: ObjectValue | null = null
      for (const item of chunks) {
        if (item.type === 'content_block_start') { block = { ...item.content_block }; partial = ''; blocks.push(block!) }
        if (item.type === 'content_block_delta' && block) {
          if (item.delta.type === 'text_delta') block.text += item.delta.text
          if (item.delta.type === 'input_json_delta') partial += item.delta.partial_json
        }
        if (item.type === 'content_block_stop' && block?.type === 'tool_use') block.input = JSON.parse(partial || '{}')
        if (item.type === 'message_delta') { message.stop_reason = item.delta.stop_reason; message.usage.output_tokens = item.usage.output_tokens }
      }
      return new Response(JSON.stringify({ ...message, content: blocks }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
  }
}
