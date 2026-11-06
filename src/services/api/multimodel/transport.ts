import { createHash, randomUUID } from 'node:crypto'
import type { IndependentModelProfile } from './profiles.js'
import type { ProviderRoute } from './registry.js'
import { type AnthropicRequest, toResponses, toChatCompletions } from './convert.js'

// biome-ignore lint/suspicious/noExplicitAny: Provider wire events have different shapes and are normalized here.
type ObjectValue = Record<string, any>

function asError(status: number, message: string, upstream?: Headers): Response {
  const headers = new Headers({ 'content-type': 'application/json' })
  for (const key of ['retry-after', 'retry-after-ms', 'x-request-id', 'request-id']) {
    const value = upstream?.get(key)
    if (value !== null && value !== undefined) headers.set(key, value)
  }
  if (!headers.has('request-id') && headers.has('x-request-id')) {
    headers.set('request-id', headers.get('x-request-id')!)
  }
  const type = status === 400 ? 'invalid_request_error'
    : status === 401 || status === 403 ? 'authentication_error'
    : status === 404 ? 'not_found_error'
    : status === 429 ? 'rate_limit_error' : 'api_error'
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status, headers,
  })
}
function usageFrom(value: ObjectValue | undefined): ObjectValue {
  if (!value) return { input_tokens: 0, output_tokens: 0 }
  const cached = value.input_tokens_details?.cached_tokens ??
    value.prompt_tokens_details?.cached_tokens ?? value.prompt_cache_hit_tokens ?? 0
  const total = value.input_tokens ?? value.prompt_tokens ?? value.promptTokenCount ?? 0
  return {
    input_tokens: Math.max(0, total - cached),
    output_tokens: value.output_tokens ?? value.completion_tokens ?? value.candidatesTokenCount ?? 0,
    cache_read_input_tokens: cached,
    reasoning_output_tokens: value.output_tokens_details?.reasoning_tokens ??
      value.completion_tokens_details?.reasoning_tokens ?? 0,
  }
}
class AnthropicEvents {
  private index = 0
  private open: number | null = null
  private activeType: 'text' | 'thinking' | 'tool' | null = null
  private hasTools = false
  private usage: ObjectValue = { input_tokens: 0, output_tokens: 0 }
  constructor(model: string, private readonly emit: (event: ObjectValue) => void,
    private readonly replaySignature: string) {
    this.emit({ type: 'message_start', message: {
      id: `msg_${randomUUID().replaceAll('-', '')}`, type: 'message', role: 'assistant',
      model, content: [], stop_reason: null, stop_sequence: null, usage: this.usage,
    } })
  }
  setUsage(value: ObjectValue | undefined): void { this.usage = usageFrom(value) }
  private stopBlock(): void {
    if (this.open !== null) {
      if (this.activeType === 'thinking' && this.replaySignature) {
        this.emit({ type: 'content_block_delta', index: this.open,
          delta: { type: 'signature_delta', signature: this.replaySignature } })
      }
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
  thinking(delta: string): void {
    if (!delta) return
    if (this.activeType !== 'thinking') {
      this.stopBlock()
      this.open = this.index++
      this.activeType = 'thinking'
      this.emit({ type: 'content_block_start', index: this.open,
        content_block: { type: 'thinking', thinking: '', signature: '' } })
    }
    this.emit({ type: 'content_block_delta', index: this.open,
      delta: { type: 'thinking_delta', thinking: delta } })
  }
  replay(item: ObjectValue): void {
    if (typeof item.encrypted_content !== 'string' || !item.encrypted_content) return
    this.stopBlock()
    const index = this.index++
    this.emit({ type: 'content_block_start', index, content_block: {
      type: 'redacted_thinking', data: this.replaySignature + ':' + JSON.stringify(item),
    } })
    this.emit({ type: 'content_block_stop', index })
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
  finish(reason?: string): void {
    this.stopBlock()
    this.emit({ type: 'message_delta', delta: {
      stop_reason: reason ?? (this.hasTools ? 'tool_use' : 'end_turn'), stop_sequence: null,
    }, usage: { input_tokens: this.usage.input_tokens, output_tokens: this.usage.output_tokens,
      cache_read_input_tokens: this.usage.cache_read_input_tokens,
      reasoning_output_tokens: this.usage.reasoning_output_tokens } })
    this.emit({ type: 'message_stop' })
  }
}
async function* sseMessages(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<ObjectValue | '[DONE]'> {
  const reader = stream.getReader()
  const onAbort = () => { void reader.cancel(signal?.reason).catch(() => {}) }
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) onAbort()
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
      let pos = buffer.indexOf('\n')
      while (pos >= 0) {
        const line = buffer.slice(0, pos).replace(/\r$/, '')
        buffer = buffer.slice(pos + 1)
        pos = buffer.indexOf('\n')
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
    signal?.removeEventListener('abort', onAbort)
    try { await reader.cancel() } finally { reader.releaseLock() }
  }
}
function emitFromResponses(
  data: ObjectValue, events: AnthropicEvents,
  state: { text: boolean; completed: boolean; stopReason?: string; replayed: Set<string>; tool: Map<number, ObjectValue> },
): void {
  const type = data.type
  if (type === 'response.output_text.delta') {
    events.text(String(data.delta ?? ''))
    state.text = true
  } else if (type === 'response.refusal.delta') {
    events.text(String(data.delta ?? ''))
    state.stopReason = 'refusal'
  } else if (type === 'response.output_item.done' && data.item?.type === 'reasoning') {
    if (typeof data.item.encrypted_content === 'string') {
      events.replay(data.item)
      state.replayed.add(String(data.item.id))
    }
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
      if (item.type === 'reasoning' && !state.replayed.has(String(item.id))) events.replay(item)
      if (item.type === 'message') {
        for (const part of item.content ?? []) if (part.type === 'refusal') {
          if (!state.stopReason) events.text(String(part.refusal ?? ''))
          state.stopReason = 'refusal'
        }
      }
      if (item.type !== 'function_call' || state.stopReason === 'refusal') continue
      const exists = [...state.tool.values()].some(t => t.id === item.call_id)
      if (!exists) state.tool.set(state.tool.size, { id: item.call_id, name: item.name, arguments: item.arguments ?? '{}' })
    }
    for (const item of state.stopReason ? [] : state.tool.values()) {
      if (!item.name) throw new Error('Responses returned a tool call without a name')
      events.tool(item.name, item.id, item.arguments || '{}')
    }
  } else if (type === 'response.incomplete') {
    state.completed = true
    state.stopReason = responsesStopReason(data.response ?? {})
    events.setUsage(data.response?.usage)
  } else if (type === 'response.failed') {
    throw new Error(`Responses ${type}: ${JSON.stringify(data.response?.error ?? data.response?.incomplete_details ?? {})}`)
  } else if (type === 'error') {
    throw new Error(`Responses stream error: ${JSON.stringify(data.error ?? data)}`)
  }
}
function emitFromChat(
  data: ObjectValue, events: AnthropicEvents,
  state: { completed: boolean; stopReason?: string; calls: Map<number, ObjectValue> },
): void {
  if (data.error) throw new Error(`Chat completion error: ${JSON.stringify(data.error)}`)
  if (data.usage) events.setUsage(data.usage)
  for (const choice of data.choices ?? []) {
    const delta = choice.delta ?? {}
    if (typeof delta.reasoning_content === 'string') events.thinking(delta.reasoning_content)
    if (typeof delta.content === 'string') events.text(delta.content)
    for (const call of delta.tool_calls ?? []) {
      const index = Number(call.index ?? 0)
      const found = state.calls.get(index) ?? { id: '', name: '', arguments: '' }
      if (call.id) found.id = call.id
      if (call.function?.name) found.name = call.function.name
      if (call.function?.arguments) found.arguments += call.function.arguments
      state.calls.set(index, found)
    }
    if (choice.finish_reason) {
      state.stopReason = chatStopReason(choice.finish_reason)
      state.completed = true
    }
  }
}
function chatStopReason(reason: unknown): string | undefined {
  switch (reason) {
    case 'stop': case 'tool_calls': case 'function_call': return undefined
    case 'length': return 'max_tokens'
    case 'content_filter': return 'refusal'
    default: throw new Error(`Unknown Chat Completions finish reason: ${String(reason)}`)
  }
}

function responsesStopReason(body: ObjectValue): string | undefined {
  if (body.status === 'failed' || body.error) throw new Error('Responses request failed')
  if (body.status !== 'incomplete' && !body.incomplete_details) return undefined
  switch (body.incomplete_details?.reason) {
    case 'max_output_tokens': return 'max_tokens'
    case 'content_filter': return 'refusal'
    default: throw new Error('Responses ended incomplete without a recognized reason')
  }
}

function materializeResponse(body: ObjectValue, route: ProviderRoute, signature: string): ObjectValue {
  const content: ObjectValue[] = []
  const usage = usageFrom(body.usage)
  let reason = route.protocol === 'responses' ? responsesStopReason(body)
    : chatStopReason(body.choices?.[0]?.finish_reason)
  if (route.protocol === 'responses') {
    for (const item of body.output ?? []) {
      if (item.type === 'message') {
        for (const part of item.content ?? []) {
          if (part.type === 'output_text') content.push({ type: 'text', text: part.text ?? '' })
          if (part.type === 'refusal') {
            reason = 'refusal'
            content.push({ type: 'text', text: part.refusal ?? '' })
          }
        }
      }
      if (item.type === 'reasoning' && typeof item.encrypted_content === 'string') {
        content.push({ type: 'redacted_thinking', data: signature + ':' + JSON.stringify(item) })
      }
      if (item.type === 'function_call' && !reason) content.push({
        type: 'tool_use', id: item.call_id, name: item.name, input: JSON.parse(item.arguments || '{}'),
      })
    }
  } else {
    const message = body.choices?.[0]?.message
    if (message?.reasoning_content) content.push({ type: 'thinking', thinking: message.reasoning_content, signature })
    if (message?.content) content.push({ type: 'text', text: message.content })
    for (const call of message?.tool_calls ?? []) content.push({
      type: 'tool_use', id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments || '{}'),
    })
  }
  return {
    id: body.id ?? `msg_${randomUUID().replaceAll('-', '')}`, type: 'message', role: 'assistant',
    model: `${route.provider}/${route.model}`, content,
    stop_reason: reason ?? (content.some(x => x.type === 'tool_use') ? 'tool_use' : 'end_turn'),
    stop_sequence: null, usage,
  }
}
/**
 * Fetch bridge operates at the existing Anthropic SDK transport boundary.
 * No provider credentials or telemetry reach the original Anthropic API.
 */
export function makeIndependentFetch(
  route: ProviderRoute, bearer: string,
  upstream: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch,
  profile?: IndependentModelProfile,
  accountIdentity = bearer,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.origin !== 'https://333-model-bridge.invalid' || url.pathname !== '/v1/messages' || request.method !== 'POST') {
      throw new Error('Independent model bridge received an unexpected SDK endpoint')
    }
    const body = await request.json() as AnthropicRequest
    if (body.model !== `${route.provider}/${route.model}`) {
      throw new Error('Independent model bridge request model changed unexpectedly')
    }
    if (profile?.supportsTools === false && body.tools?.length) {
      return asError(400, 'The selected model does not support tool calls')
    }
    if (profile?.supportsVision === false && body.messages.some(message =>
      Array.isArray(message.content) && message.content.some(block =>
        block.type === 'image' || (block.type === 'tool_result' && Array.isArray(block.content) &&
          block.content.some(part => part?.type === 'image'))))) {
      return asError(400, 'The selected model does not support image input')
    }
    if (profile?.supportsReasoning === false) {
      delete body.thinking
      if (body.output_config) delete body.output_config.effort
    }
    const qualifiedModel = `${route.provider}/${route.model}`
    const signature = '333-replay:' + createHash('sha256')
      .update(JSON.stringify([qualifiedModel, route.endpoint, accountIdentity])).digest('hex')
    const payload = route.protocol === 'responses'
      ? toResponses(body, route.model, signature)
      : toChatCompletions(body, route.model, route.provider, signature)
    // Plan-sharing OAuth strictly requires streaming even for validation calls.
    if (route.provider === 'chatgpt') {
      // ChatGPT plan usage is a narrower Responses API profile than API-key
      // billing. The preview route rejects these fields.
      for (const key of [
        'max_output_tokens', 'temperature', 'top_p', 'background',
        'conversation', 'max_tool_calls', 'metadata', 'moderation',
        'multi_agent', 'prompt', 'prompt_cache_retention',
        'safety_identifier', 'top_logprobs', 'truncation', 'user',
      ]) delete payload[key]
      payload.store = false
      payload.stream = true
    }
    const headers = new Headers({ 'content-type': 'application/json' })
    headers.set('Authorization', `Bearer ${bearer}`)
    const cancellation = new AbortController()
    const signal = AbortSignal.any([init?.signal ?? request.signal, cancellation.signal])
    signal.throwIfAborted()
    const response = await upstream(route.endpoint, {
      method: 'POST', headers, body: JSON.stringify(payload), signal,
    })
    if (!response.ok) {
      const detail = await response.text()
      return asError(response.status, `${route.provider} HTTP ${response.status}: ${detail.slice(0, 1500)}`, response.headers)
    }
    const responseBody = response.body
    if (!responseBody) return asError(502, `${route.provider} returned empty response`)
    if (!body.stream && route.provider !== 'chatgpt') {
      return new Response(JSON.stringify(materializeResponse(await response.json() as ObjectValue, route, signature)), {
        headers: { 'content-type': 'application/json' },
      })
    }
    const encoder = new TextEncoder()
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      cancel(reason) {
        cancelled = true
        cancellation.abort(reason)
      },
      async start(controller) {
        const emit = (value: ObjectValue) => controller.enqueue(encoder.encode(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`))
        const events = new AnthropicEvents(qualifiedModel, emit, signature)
        const rstate = { completed: false, text: false, replayed: new Set<string>(), stopReason: undefined as string | undefined, tool: new Map<number, ObjectValue>() }
        const cstate = { completed: false, stopReason: undefined as string | undefined, calls: new Map<number, ObjectValue>() }
        try {
          for await (const chunk of sseMessages(responseBody, signal)) {
            if (chunk === '[DONE]' || cancelled) break
            if (route.protocol === 'responses') emitFromResponses(chunk, events, rstate)
            else emitFromChat(chunk, events, cstate)
            if (rstate.completed) break
          }
          if (cancelled) return
          if (route.protocol === 'responses' && !rstate.completed) throw new Error('Responses ended without response.completed')
          if (route.protocol === 'chat-completions' && !cstate.completed) throw new Error('Chat stream ended without a finish_reason')
          for (const call of cstate.stopReason ? [] : cstate.calls.values()) {
            if (!call.name) throw new Error('Chat stream returned tool call with no name')
            events.tool(call.name, call.id, call.arguments || '{}')
          }
          events.finish(rstate.stopReason ?? cstate.stopReason)
          controller.close()
        } catch (error) { if (!cancelled) controller.error(error) }
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
        if (item.type === 'content_block_start') { const newBlock = { ...item.content_block }; block = newBlock; partial = ''; blocks.push(newBlock) }
        if (item.type === 'content_block_delta' && block) {
          if (item.delta.type === 'text_delta') block.text += item.delta.text
          if (item.delta.type === 'input_json_delta') partial += item.delta.partial_json
        }
        if (item.type === 'content_block_stop' && block?.type === 'tool_use') block.input = JSON.parse(partial || '{}')
        if (item.type === 'message_delta') { message.stop_reason = item.delta.stop_reason; message.usage = { ...message.usage, ...item.usage } }
      }
      return new Response(JSON.stringify({ ...message, content: blocks }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
  }
}
