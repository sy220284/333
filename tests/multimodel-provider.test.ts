import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveIndependentModel, getIndependentApiKey, discoverIndependentModels } from '../src/services/api/multimodel/registry.ts'
import { toResponses, toChatCompletions, toGemini } from '../src/services/api/multimodel/convert.ts'
import { makeIndependentFetch } from '../src/services/api/multimodel/transport.ts'

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
function stream(...events: unknown[]): Response {
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } })
}
function messages(sse: string): any[] {
  return sse.split('\n').filter(x => x.startsWith('data: '))
    .map(x => x.slice(6)).filter(x => x !== '[DONE]').map(x => JSON.parse(x))
}
test('qualified models only change providers when explicitly selected', () => {
  assert.equal(resolveIndependentModel('claude-opus-5-5'), null)
  assert.equal(resolveIndependentModel('openai/gpt-6.1-sol')?.protocol, 'responses')
  assert.equal(resolveIndependentModel('gemini/gemini-3.8-flash')?.protocol, 'gemini')
  assert.equal(resolveIndependentModel('xai/grok-4')?.protocol, 'chat-completions')
  assert.equal(resolveIndependentModel('unknown/model'), null)
  assert.throws(() => getIndependentApiKey(resolveIndependentModel('openai/gpt-6.1-sol')!, {}))
  assert.equal(getIndependentApiKey(resolveIndependentModel('openai/gpt-6.1-sol')!, { OPENAI_API_KEY: 'TEST' }), 'TEST')
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
test('Gemini converts tool calls and function responses by their registered name', () => {
  const result = toGemini(body)
  assert.equal(result.systemInstruction.parts[0].text, 'Keep the exact original prompt.')
  assert.equal(result.contents[1].parts[1].functionCall.name, 'Read')
  assert.equal(result.contents[2].parts[0].functionResponse.name, 'Read')
  assert.equal(result.tools[0].functionDeclarations[0].name, 'Read')
})
test('Chat Completions preserves tool call order and tool results', () => {
  const result = toChatCompletions(body, 'deepseek-chat')
  assert.equal(result.messages[2].tool_calls[0].id, 'call_42')
  assert.equal(result.messages[3].tool_call_id, 'call_42')
  assert.equal(result.stream, true)
})
test('Responses streaming is mapped into Anthropic-style tool and text events without outbound Anthropic calls', async () => {
  const route = resolveIndependentModel('openai/gpt-6.1-sol')!
  let target = '', authorization = '', inputBody: any
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
  const route = resolveIndependentModel('deepseek/deepseek-chat')!
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
test('Gemini native stream maps function calls into shared tools', async () => {
  const route = resolveIndependentModel('gemini/gemini-3.8-flash')!
  const backend = async () => stream(
    { candidates: [{ content: { parts: [{ text: 'ok' }, { functionCall: { name: 'Read', args: { file_path: '/a' } } }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 3 } },
  )
  const modelBody = { ...body, model: 'gemini/gemini-3.8-flash' }
  const request = new Request('https://333-model-bridge.invalid/v1/messages', { method: 'POST', body: JSON.stringify(modelBody) })
  const result = messages(await (await makeIndependentFetch(route, 'secret', backend as typeof fetch)(request)).text())
  assert.ok(result.some(x => x.delta?.text === 'ok'))
  assert.ok(result.some(x => x.content_block?.name === 'Read'))
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
