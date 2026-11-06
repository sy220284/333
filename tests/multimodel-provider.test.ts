import assert from 'node:assert/strict'
import test from 'node:test'
import { type ProviderRoute, PROVIDERS, resolveIndependentModel, getIndependentApiKey, discoverIndependentModels } from '../src/services/api/multimodel/registry.ts'
import { type AnthropicRequest, toResponses, toChatCompletions } from '../src/services/api/multimodel/convert.ts'
import { makeIndependentFetch } from '../src/services/api/multimodel/transport.ts'
import { runModelToolRoundTrip } from '../src/services/api/multimodel/capabilityProbe.ts'
import { validateApiKeyProvider } from '../src/services/auth/apiKeyVault.ts'

const body = {
  model: 'openai/gpt-6.1-sol',
  system: [{ type: 'text', text: 'Keep the exact original prompt.' }],
  messages: [
    { role: 'user' as const, content: [{ type: 'text', text: 'Read the code.' }] },
    { role: 'assistant' as const, content: [
      { type: 'text', text: 'Calling tool' },
      { type: 'tool_use', id: 'call_42', name: 'Read', input: { file_path: '/tmp/sample' } },
    ] },
    { role: 'user' as const, content: [
      { type: 'tool_result', tool_use_id: 'call_42', content: 'export const answer = 42' },
    ] },
  ],
  max_tokens: 4096, stream: true,
  tools: [{ name: 'Read', description: 'Read a file', input_schema: {
    type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'],
  } }],
}
function requireRoute(id: string): ProviderRoute {
  const route = resolveIndependentModel(id)
  assert.ok(route)
  return route
}
function stream(...events: unknown[]): Response {
  return new Response(`${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`,
    { headers: { 'content-type': 'text/event-stream' } })
}
// biome-ignore lint/suspicious/noExplicitAny: Test assertions inspect multiple independent provider event shapes.
function messages(sse: string): any[] {
  return sse.split('\n').filter(x => x.startsWith('data: '))
    .map(x => x.slice(6)).filter(x => x !== '[DONE]').map(x => JSON.parse(x))
}
test('qualified models only change providers when explicitly selected', () => {
  assert.equal(resolveIndependentModel('claude-opus-5-5'), null)
  assert.equal(resolveIndependentModel('openai/gpt-6.1-sol')?.protocol, 'responses')
  assert.equal(resolveIndependentModel('gemini/gemini-3.8-flash'), null)
  assert.equal(resolveIndependentModel('xai/grok-4'), null)
  assert.equal(resolveIndependentModel('unknown/model'), null)
  assert.throws(() => getIndependentApiKey(requireRoute('openai/gpt-6.1-sol'), {}))
  assert.equal(getIndependentApiKey(requireRoute('openai/gpt-6.1-sol'), { OPENAI_API_KEY: 'TEST' }), 'TEST')
})
test('Responses preserves prompts, tool IDs, result pairing, reasoning budget and stop rules', () => {
  const result = toResponses({ ...body, output_config: { effort: 'high' } }, 'gpt-6.1-sol')
  assert.equal(result.instructions, 'Keep the exact original prompt.')
  assert.equal(result.store, false)
  assert.equal(result.reasoning.effort, 'high')
  assert.equal(result.input[1].content[0].type, 'output_text')
  assert.equal(result.input[2].type, 'function_call')
  assert.equal(result.input[2].call_id, 'call_42')
  assert.equal(result.input[3].type, 'function_call_output')
  assert.equal(result.input[3].call_id, 'call_42')
  assert.equal(result.tools[0].name, 'Read')
})
test('Chat Completions preserves tool call order and tool results', () => {
  const result = toChatCompletions(body, 'deepseek-chat')
  assert.equal(result.messages[2].tool_calls[0].id, 'call_42')
  assert.equal(result.messages[3].tool_call_id, 'call_42')
  assert.equal(result.stream, true)
})
test('Responses streaming is mapped into Anthropic-style tool and text events without outbound Anthropic calls', async () => {
  const route = requireRoute('openai/gpt-6.1-sol')
  let target = '', authorization = ''; let inputBody: Record<string, unknown>
  const backend = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    target = String(url)
    authorization = new Headers(init?.headers).get('authorization') ?? ''
    inputBody = JSON.parse(String(init?.body))
    return stream(
      { type: 'response.output_text.delta', delta: 'checked' },
      { type: 'response.output_item.done', output_index: 1, item: {
        type: 'function_call', call_id: 'call_test', name: 'Read', arguments: '{"file_path":"/a"}',
      } },
      { type: 'response.completed', response: { output: [], usage: { input_tokens: 100, output_tokens: 15 } } },
    )
  }
  const client = makeIndependentFetch(route, 'sk-test', backend as typeof fetch)
  const request = new Request('https://333-model-bridge.invalid/v1/messages', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  })
  const response = await client(request)
  assert.equal(response.status, 200)
  const events = messages(await response.text())
  assert.equal(target, 'https://api.openai.com/v1/responses')
  assert.equal(authorization, 'Bearer sk-test')
  assert.equal(inputBody.model, 'gpt-6.1-sol')
  assert.equal(events[0].type, 'message_start')
  assert.ok(events.some(x => x.delta?.type === 'text_delta' && x.delta?.text === 'checked'))
  assert.ok(events.some(x => x.content_block?.name === 'Read'))
  assert.equal(events.find(x => x.type === 'message_delta').delta.stop_reason, 'tool_use')
})
test('Chat completions streaming preserves interleaved tool fragments and terminal state', async () => {
  const route = requireRoute('deepseek/deepseek-chat')
  const backend = async () => stream(
    { choices: [{ delta: { content: 'done' } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', function: { name: 'Read', arguments: '{"file_' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'path":"/a"}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 8, completion_tokens: 4 } },
  )
  const modelBody = { ...body, model: 'deepseek/deepseek-chat' }
  const request = new Request('https://333-model-bridge.invalid/v1/messages', { method: 'POST', body: JSON.stringify(modelBody) })
  const result = messages(await (await makeIndependentFetch(route, 'secret', backend as typeof fetch)(request)).text())
  assert.ok(result.some(x => x.content_block?.id === 'call_a'))
  assert.ok(result.some(x => x.delta?.partial_json === '{"file_path":"/a"}'))
  assert.equal(result.at(-1)?.type, 'message_stop')
})
test('ChatGPT lists only model entries exposed for the connected account', async () => {
  const results = await discoverIndependentModels('chatgpt', 'oauth-token',
    (async () => new Response(JSON.stringify({ models: [
      { slug: 'gpt-6.1-sol', visibility: 'list' },
      { slug: 'internal-hidden', visibility: 'hidden' },
    ] }))) as typeof fetch)
  assert.deepEqual(results, ['gpt-6.1-sol'])
})

test('model capability probe performs a real tool-result second turn', async () => {
  const requests: Record<string, unknown>[] = []
  const answer = (...entries: unknown[]) => entries.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')
  const send = async (request: Record<string, unknown>): Promise<string> => {
    requests.push(request)
    return requests.length === 1 ? answer(
      { type: 'message_start' },
      { type: 'content_block_start', index: 0, content_block: { name: '333_probe', id: 'toolu_probe' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"ok":true}' } },
      { type: 'message_stop' },
    ) : answer(
      { type: 'message_start' },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'PROBE_OK' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    )
  }
  const result = await runModelToolRoundTrip('openai/gpt-6.1-sol', send)
  assert.equal(result.roundTrip, true)
  assert.equal(requests.length, 2)
  const second = requests[1] as {messages: Array<{ role: string; content: unknown }>}
  assert.equal(second.messages[1].role, 'assistant')
  assert.deepEqual(second.messages[2].content, [
    { type: 'tool_result', tool_use_id: 'toolu_probe', content: 'Tool succeeded. Respond with PROBE_OK.' },
  ])
})

test('capability probe reports failure when follow-up does not finish', async () => {
  let count = 0
  const answer = (...entries: unknown[]) => entries.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')
  const send = async (): Promise<string> => {
    count++
    return count === 1 ? answer(
      { type: 'message_start' },
      { type: 'content_block_start', index: 0, content_block: { name: '333_probe', id: 'toolu_probe' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"ok":true}' } },
      { type: 'message_stop' },
    ) : answer(
      { type: 'message_start' },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
      { type: 'message_stop' },
    )
  }
  const result = await runModelToolRoundTrip('openai/gpt-6.1-sol', send)
  assert.equal(result.tool, true)
  assert.equal(result.roundTrip, false)
  assert.equal(count, 2)
})

test('ChatGPT accepts the standard OpenAI models response without a visibility field', async () => {
  const seen: string[] = []
  const result = await discoverIndependentModels('chatgpt', 'oauth-token',
    (async (url: RequestInfo | URL) => {
      seen.push(String(url))
      return new Response(JSON.stringify({ object: 'list', data: [
        { id: 'gpt-6.1-sol', object: 'model' },
        { id: 'gpt-6-astra', object: 'model' },
      ] }))
    }) as typeof fetch)
  assert.deepEqual(result, ['gpt-6.1-sol', 'gpt-6-astra'])
  assert.deepEqual(seen, ['https://api.openai.com/v1/models'])
})

test('removed Gemini and xAI/Grok providers cannot be selected or configured', () => {
  assert.deepEqual(Object.keys(PROVIDERS).sort(), [
    'chatgpt', 'deepseek', 'kimi', 'minimax', 'openai', 'openrouter', 'qwen', 'zhipu',
  ])
  assert.equal(resolveIndependentModel('gemini/gemini-3.8-flash'), null)
  assert.equal(resolveIndependentModel('xai/grok-4'), null)
  assert.throws(() => validateApiKeyProvider('gemini'))
  assert.throws(() => validateApiKeyProvider('xai'))
  assert.equal(resolveIndependentModel('deepseek/deepseek-chat')?.protocol, 'chat-completions')
  assert.equal(resolveIndependentModel('openai/gpt-6.1-sol')?.protocol, 'responses')
})

test('DeepSeek reasoning effort, thinking mode and previous reasoning are retained in tool sessions', () => {
  const payload = toChatCompletions({
    ...body, thinking: { type: 'enabled' }, output_config: { effort: 'max' },
    messages: [{ role: 'assistant', content: [
      { type: 'thinking', thinking: 'verified previous thought', signature: '333-replay:test' },
      { type: 'tool_use', id: 'call_context', name: 'Read', input: { file_path: '/tmp' } },
    ] }],
  }, 'deepseek-v4-pro', 'deepseek', '333-replay:test')
  assert.deepEqual(payload.thinking, { type: 'enabled' })
  assert.equal(payload.reasoning_effort, 'max')
  assert.equal(payload.messages[1].reasoning_content, 'verified previous thought')
  assert.equal(payload.stream_options.include_usage, true)
})
test('Qwen and OpenRouter model-specific thinking controls are mapped without changing prompts', () => {
  assert.equal(toChatCompletions({ ...body, thinking: { type: 'disabled' } }, 'qwen3.8-max', 'qwen').enable_thinking, false)
  assert.equal(toChatCompletions({ ...body, output_config: { effort: 'high' } }, 'qwen3.8-max', 'openrouter').reasoning.effort, 'high')
})
test('Chat completions streaming retains reasoning blocks and reasoning token usage', async () => {
  const route = requireRoute('deepseek/deepseek-v4-pro')
  const backend = async () => stream(
    { choices: [{ delta: { reasoning_content: 'inspected' } }] },
    { choices: [{ delta: { content: 'result' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 8 } } },
  )
  const req = new Request('https://333-model-bridge.invalid/v1/messages', {
    method: 'POST', body: JSON.stringify({ ...body, model: 'deepseek/deepseek-v4-pro' }),
  })
  const response = await makeIndependentFetch(route, 'test', backend as typeof fetch)(req)
  const events = messages(await response.text())
  assert.equal(events.some(event => event.delta?.type === 'thinking_delta' && event.delta.thinking === 'inspected'), true)
  assert.equal(events.some(event => event.delta?.type === 'text_delta' && event.delta.text === 'result'), true)
  assert.equal(events.find(event => event.type === 'message_delta').usage.reasoning_output_tokens, 8)
})

test('Qwen3.8 reasoning effort uses the provider-specific low/medium/xhigh range', () => {
  const input = { ...body, output_config: { effort: 'max' } }
  assert.equal(toChatCompletions(input, 'qwen3.8-max', 'qwen').reasoning_effort, 'xhigh')
  assert.equal(toChatCompletions({ ...input, output_config: { effort: 'medium' } }, 'qwen3.8-max', 'qwen').reasoning_effort, 'medium')
})
test('GLM-5.3 thinking remains enabled and invalid disabled requests are rejected before billing', () => {
  const payload = toChatCompletions({ ...body, thinking: { type: 'enabled' },
    output_config: { effort: 'xhigh' } }, 'glm-5.3', 'zhipu')
  assert.deepEqual(payload.thinking, { type: 'enabled' })
  assert.equal(payload.reasoning_effort, 'max')
  assert.throws(() => toChatCompletions({ ...body, thinking: { type: 'disabled' } }, 'glm-5.3', 'zhipu'), /始终启用思考/)
})
test('MiniMax M3.1 and Kimi K2.7 enforce documented thinking boundaries', () => {
  assert.equal(toChatCompletions({ ...body, output_config: { effort: 'max' } }, 'MiniMax-M3.1-Flash', 'minimax').reasoning_effort, 'max')
  assert.throws(() => toChatCompletions({ ...body, thinking: { type: 'disabled' } }, 'MiniMax-M3.1-Flash', 'minimax'), /保留推理能力/)
  assert.throws(() => toChatCompletions({ ...body, thinking: { type: 'disabled' } }, 'kimi-k2.7-code', 'kimi'), /不支持关闭思考/)
  const selected = toChatCompletions({ ...body, tool_choice: { type: 'tool', name: 'Read' } }, 'kimi-k2.7-code', 'kimi')
  assert.equal(selected.tool_choice, 'auto')
})

test('multimodal tool results retain image data and precede ordinary chat messages', () => {
  const request: AnthropicRequest = { ...body, messages: [
    ...body.messages.slice(0, 2),
    { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'call_42', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      ] },
      { type: 'text', text: 'Follow-up' },
    ] },
  ] }
  const responses = toResponses(request, 'test')
  assert.equal(responses.input.find((item: {type: string}) => item.type === 'function_call_output').output[0].type, 'input_image')
  const chat = toChatCompletions(request, 'test')
  assert.equal(chat.messages.at(-2).role, 'tool')
  assert.equal(chat.messages.at(-1).content[0].image_url.url, 'data:image/png;base64,AAAA')
})

test('structured outputs are mapped for both remote protocols', () => {
  const schema = { type: 'object', properties: {}, additionalProperties: false }
  const request = { ...body, output_config: { format: { type: 'json_schema', schema } } }
  assert.deepEqual(toResponses(request, 'test').text.format.schema, schema)
  assert.deepEqual(toChatCompletions(request, 'test').response_format.json_schema.schema, schema)
})

test('the bridge retains retry identity and accounts for cached input only once', async () => {
  const route = requireRoute('openai/test')
  const request = () => new Request('https://333-model-bridge.invalid/v1/messages', {
    method: 'POST', body: JSON.stringify({ ...body, model: 'openai/test', stream: false }),
  })
  const limited = await makeIndependentFetch(route, 'key', async () =>
    new Response('limited', { status: 429, headers: { 'retry-after': '9', 'x-request-id': 'abc' } }))(request())
  assert.equal(limited.headers.get('retry-after'), '9')
  assert.equal(limited.headers.get('request-id'), 'abc')
  const incomplete = await makeIndependentFetch(route, 'key', async () =>
    Response.json({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
      usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 40 } } }))(request())
  const result = await incomplete.json() as { stop_reason: string; usage: Record<string, number> }
  assert.equal(result.stop_reason, 'max_tokens')
  assert.equal(result.usage.input_tokens, 60)
  assert.equal(result.usage.cache_read_input_tokens, 40)
})

test('cancelling the translated stream cancels a pending upstream read', async () => {
  const route = requireRoute('openai/test')
  const request = new Request('https://333-model-bridge.invalid/v1/messages', {
    method: 'POST', body: JSON.stringify({ ...body, model: 'openai/test', stream: true }),
  })
  let cancelled = false
  const upstream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true } })
  const result = await makeIndependentFetch(route, 'key', async () => new Response(upstream))(request)
  const reader = result.body!.getReader()
  assert.equal((await reader.read()).done, false)
  await reader.cancel()
  assert.equal(cancelled, true)
})

test('Responses encrypted reasoning replays only on the same connection and model', async () => {
  const route = requireRoute('openai/test')
  const encrypted = { type: 'reasoning', id: 'rs_42', summary: [], encrypted_content: 'opaque' }
  const request = (messages: AnthropicRequest['messages']) => new Request('https://333-model-bridge.invalid/v1/messages', {
    method: 'POST', body: JSON.stringify({ ...body, model: 'openai/test', messages, stream: false }),
  })
  const first = await makeIndependentFetch(route, 'key-a', async () =>
    Response.json({ status: 'completed', output: [encrypted] }))(request([]))
  const history = [{ role: 'assistant' as const, content: (await first.json() as { content: [] }).content }]
  for (const key of ['key-a', 'key-b']) {
    await makeIndependentFetch(route, key, async (_url, init) => {
      const sent = JSON.parse(String(init?.body))
      assert.deepEqual(sent.input, key === 'key-a' ? [encrypted] : [])
      return Response.json({ status: 'completed', output: [] })
    })(request(history))
  }
})

test('MiniMax M3.1 Flash preserves reasoning and requests terminal usage during tool turns', () => {
  const signature = '333-replay:current'
  const request: AnthropicRequest = { ...body, messages: [
    { role: 'assistant', content: [
      { type: 'thinking', thinking: 'matching', signature },
      { type: 'thinking', thinking: 'foreign', signature: '333-replay:other' },
      { type: 'tool_use', id: 'call_42', name: 'Read', input: {} },
    ] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_42', content: 'fixture' }] },
  ] }
  const payload = toChatCompletions(request, 'MiniMax-M3.1-Flash', 'minimax', signature)
  assert.equal(payload.messages[1].reasoning_content, 'matching')
  assert.equal(payload.messages[2].tool_call_id, 'call_42')
  assert.equal(payload.reasoning_split, true)
  assert.equal(payload.stream_options.include_usage, true)
  assert.equal(payload.max_completion_tokens, body.max_tokens)
  assert.equal(payload.max_tokens, undefined)
})
