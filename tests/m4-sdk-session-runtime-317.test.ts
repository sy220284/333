import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  unstable_v2_prompt,
} from '../src/entrypoints/agentSdkTypes.js'
import type { SDKSession } from '../src/entrypoints/sdk/runtimeTypes.js'

test('SDK sends multiple turns and resumes the transcript through the rebuilt CLI', { timeout: 30000 }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), '333-sdk-session-'))
  const prompts: string[] = []
  const model = 'claude-sonnet-4-6'
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || !request.url?.startsWith('/v1/messages')) {
      response.writeHead(404).end()
      return
    }
    let body = ''
    for await (const chunk of request) body += chunk
    prompts.push(JSON.stringify(JSON.parse(body).messages))
    const n = prompts.length
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    const event = (type: string, fields: object = {}) =>
      response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`)
    event('message_start', { message: { id: `msg_${n}`, type: 'message', model,
      role: 'assistant', content: [], stop_reason: null, stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 0 } } })
    event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
    event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: `answer-${n}` } })
    event('content_block_stop', { index: 0 })
    event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 8 } })
    event('message_stop')
    response.end()
  }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const options = {
    cwd, model,
    pathToClaudeCodeExecutable: resolve('dist', process.platform === 'win32' ? 'claude.exe' : 'claude'),
    env: {
      CLAUDE_CONFIG_DIR: join(cwd, 'config'),
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`,
      ANTHROPIC_API_KEY: 'sk-ant-api03-local-fixture-only',
      CLAUDE_CODE_OAUTH_TOKEN: undefined,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_TELEMETRY: '1',
    },
  }
  const sessions: SDKSession[] = []
  async function turn(session: SDKSession, prompt: string, expected: string) {
    await session.send(prompt)
    let result
    for await (const event of session.stream()) {
      if (event.type === 'result') result = event
    }
    assert.equal(result?.subtype, 'success', JSON.stringify(result))
    if (result?.subtype === 'success') assert.equal(result.result, expected)
    assert.equal(result?.session_id, session.sessionId)
  }
  try {
    const first = unstable_v2_createSession(options)
    sessions.push(first)
    await turn(first, 'first turn', 'answer-1')
    await turn(first, 'second turn', 'answer-2')
    first.close()
    const resumed = unstable_v2_resumeSession(first.sessionId, options)
    sessions.push(resumed)
    await turn(resumed, 'resumed turn', 'answer-3')
    assert.match(prompts[2]!, /first turn/)
    assert.match(prompts[2]!, /second turn/)
    assert.match(prompts[2]!, /answer-2/)
    assert.equal((await unstable_v2_prompt('one shot', options)).subtype, 'success')
  } finally {
    for (const session of sessions) session.close()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(cwd, { recursive: true, force: true })
  }
})
