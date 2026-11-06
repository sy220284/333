import { z } from 'zod/v4'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  query,
  createSdkMcpServer,
  tool,
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  unstable_v2_prompt,
} from '../src/entrypoints/agentSdkTypes.js'
import type { SDKSession, SessionStore } from '../src/entrypoints/sdk/runtimeTypes.js'

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
    const wantsMcp = n === 10
    const wantsTool = n === 5 || wantsMcp
    if (wantsTool) {
      event('content_block_start', { index: 0, content_block: {
        type: 'tool_use', id: 'toolu_permission_test', name: wantsMcp ? 'mcp__audit__echo' : 'Bash', input: {},
      } })
      event('content_block_delta', { index: 0, delta: {
        type: 'input_json_delta', partial_json: JSON.stringify(wantsMcp ? { text: 'bridge-317' } : { command: 'touch sdk-permission-marker' }),
      } })
    } else {
      event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
      event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: `answer-${n}` } })
    }
    event('content_block_stop', { index: 0 })
    event('message_delta', { delta: { stop_reason: wantsTool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 8 } })
    event('message_stop')
    response.end()
  }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const options = {
    cwd, model,
    pathToClaudeCodeExecutable: resolve('dist', process.platform === 'win32' ? 'qerivon.exe' : 'qerivon'),
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
    const callbacks: string[] = []
    const hookTools: string[] = []
    const denied = await unstable_v2_prompt('try running a tool', {
      ...options,
      settingSources: [],
      permissionMode: 'default',
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [async input => {
        if (input.hook_event_name === 'PreToolUse') hookTools.push(input.tool_name)
        return {}
      }] }] },
      async canUseTool(tool, input, context) {
        callbacks.push(tool)
        assert.equal(input.command, 'touch sdk-permission-marker')
        assert.equal(context.toolUseID, 'toolu_permission_test')
        assert.equal(context.signal.aborted, false)
        return { behavior: 'deny', message: 'Denied by SDK test callback' }
      },
    })
    assert.equal(denied.subtype, 'success')
    assert.deepEqual(callbacks, ['Bash'])
    assert.deepEqual(hookTools, ['Bash'])
    assert.match(prompts[5]!, /Denied by SDK test callback/)
    await assert.rejects(access(join(cwd, 'sdk-permission-marker')), { code: 'ENOENT' })
    const run = query({ prompt: 'query entrypoint', options })
    try {
      assert.ok((await run.supportedCommands()).length)
      assert.ok((await run.supportedModels()).length)
      assert.deepEqual(await run.mcpServerStatus(), [])
      await run.setPermissionMode('default')
      let result
      for await (const message of run) if (message.type === 'result') result = message
      assert.equal(result?.subtype, 'success')
      assert.match(prompts[6]!, /query entrypoint/)
    } finally {
      await run.return()
    }
    const records = new Map<string, Record<string, unknown>[]>()
    const store: SessionStore = {
      async append(key, entries) {
        const id = JSON.stringify(key)
        records.set(id, [...(records.get(id) ?? []), ...entries])
      },
      async load(key) { return records.get(JSON.stringify(key)) },
      async listSessions(projectKey) {
        return Array.from(records.keys(), key => JSON.parse(key))
          .filter(key => key.projectKey === projectKey && !key.subpath)
          .map((key, index) => ({ sessionId: key.sessionId, mtime: index }))
      },
    }
    const saved = await unstable_v2_prompt('store-only first turn', { ...options, sessionStore: store })
    assert.equal(saved.subtype, 'success')
    assert.ok(records.size > 0)
    const restored = query({
      prompt: 'restored from remote store',
      options: { ...options, continue: true, sessionStore: store, env: {
        ...options.env, CLAUDE_CONFIG_DIR: join(cwd, 'separate-host-config'),
      } },
    })
    try {
      let restoredResult
      for await (const event of restored) if (event.type === 'result') restoredResult = event
      assert.equal(restoredResult?.subtype, 'success')
      assert.equal(restoredResult?.session_id, saved.session_id)
      assert.match(prompts.at(-1)!, /store-only first turn/)
      assert.match(prompts.at(-1)!, /restored from remote store/)
    } finally {
      await restored.return()
    }

    const calls: string[] = []
    const mcp = createSdkMcpServer({ name: 'audit', tools: [
      tool('echo', 'Echo the supplied text', { text: z.string() }, async ({ text }) => {
        calls.push(text)
        return { content: [{ type: 'text', text: 'echo: ' + text }] }
      }),
    ] })
    const bridged = query({
      prompt: 'call the SDK MCP echo tool',
      options: { ...options, mcpServers: { audit: mcp }, allowedTools: ['mcp__audit__echo'] },
    })
    try {
      let result
      for await (const event of bridged) if (event.type === 'result') result = event
      assert.equal(result?.subtype, 'success')
      assert.deepEqual(calls, ['bridge-317'])
      assert.match(prompts.at(-1)!, /echo: bridge-317/)
    } finally {
      await bridged.return()
    }

  } finally {
    for (const session of sessions) await session.closeAndWait()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(cwd, { recursive: true, force: true })
  }
})
