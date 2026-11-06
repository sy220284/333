import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDesktopGateway } from '../src/services/desktop/gateway.js'
import type { DesktopEvent } from '../src/services/desktop/protocol.js'
import type { DesktopTask } from '../src/services/desktop/taskProjection.js'
import type { DesktopGatewayOptions } from '../src/services/desktop/gateway.js'

const fixtureCli = String.raw`
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
const args = process.argv.slice(2)
const resumeIndex = args.indexOf('--resume')
const idIndex = args.indexOf('--session-id')
const sessionId = resumeIndex >= 0 ? args[resumeIndex + 1]
  : idIndex >= 0 ? args[idIndex + 1] : randomUUID()
const out = frame => process.stdout.write(JSON.stringify(frame) + '\n')
let awaiting = null
const taskId = 'agent-fixture'
const usage = { total_tokens: 5, tool_uses: 1, duration_ms: 10 }
const common = () => ({ session_id: sessionId, uuid: randomUUID() })
function result(reason = 'completed') {
  out({
    type: 'result', subtype: 'success', is_error: false, terminal_reason: reason,
    result: reason === 'completed' ? 'done' : 'interrupted',
    duration_ms: 1, duration_api_ms: 1, num_turns: 1,
    stop_reason: null, total_cost_usd: 0, usage: {},
    modelUsage: {}, permission_denials: [], ...common(),
  })
}
function reply(request_id, response = {}) {
  out({ type: 'control_response', response: {
    subtype: 'success', request_id, response,
  } })
}
function finish() {
  out({
    type: 'system', subtype: 'task_progress', task_id: taskId,
    description: 'Inspect workspace', usage, ...common(),
  })
  out({
    type: 'system', subtype: 'task_notification', task_id: taskId,
    status: 'completed', summary: 'Completed', output_file: '', ...common(),
  })
  result()
}
const reader = createInterface({ input: process.stdin, crlfDelay: Infinity })
reader.on('line', line => {
  try {
    const frame = JSON.parse(line)
    if (frame.type === 'control_request') {
      if (frame.request.subtype === 'initialize') {
        reply(frame.request_id, {
          models: [{ value: 'mock-model', displayName: 'Mock', description: 'Offline SDK' }],
          agents: [{ name: 'Explore', description: 'Searches' }],
          commands: [], output_style: 'default', available_output_styles: [], account: {},
        })
      } else if (frame.request.subtype === 'interrupt') {
        reply(frame.request_id)
        if (awaiting) { awaiting = null; result('aborted_streaming') }
      } else {
        reply(frame.request_id)
      }
    } else if (frame.type === 'user') {
      out({
        type: 'system', subtype: 'task_started', task_id: taskId,
        description: 'Inspect workspace', task_type: 'local_agent', ...common(),
      })
      const content = frame.message.content
      if (content === 'approve') {
        awaiting = 'permission'
        out({ type: 'control_request', request_id: randomUUID(), request: {
          subtype: 'can_use_tool', tool_name: 'Bash', tool_use_id: 'tool-fake',
          input: { command: 'pwd' },
        } })
      } else if (content === 'interrupt') {
        awaiting = 'interrupt'
      } else {
        finish()
      }
    } else if (frame.type === 'control_response' && awaiting === 'permission') {
      awaiting = null
      finish()
    }
  } catch (error) {
    process.stderr.write(String(error) + '\n')
    process.exitCode = 1
  }
})
`

async function until(predicate: () => boolean) {
  const end = Date.now() + 7000
  while (!predicate()) {
    if (Date.now() > end) throw new Error('Timed out waiting for stream-json fixture')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

test('desktop host uses real SDK stream-json child for models, approval, progress, interrupt and resume', { timeout: 30000 }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'desktop-sdk-'))
  const cli = join(cwd, 'mock-sdk-cli.mjs')
  await writeFile(cli, fixtureCli)
  const history: NonNullable<DesktopGatewayOptions['history']> = {
    async getSessionInfo(sessionId) {
      return { sessionId, summary: 'SDK fixture', lastModified: Date.now() }
    },
    async listSessions() { return [] },
    async getSessionMessages() { return [] },
  }
  const options: DesktopGatewayOptions = {
    cwd, dataDir: join(cwd, 'journal'),
    sessionOptions: { executable: 'node', pathToClaudeCodeExecutable: cli },
    history,
  }
  const gateway = createDesktopGateway(options)
  const events: DesktopEvent[] = []
  const stop = gateway.subscribe(event => events.push(event))
  try {
    const discovery = await gateway.handle({ id: 'models', method: 'models.list' }) as {
      models: Array<{ value: string }>; agents: Array<{ name: string }>
    }
    expect(discovery.models.map(item => item.value)).toEqual(['mock-model'])
    expect(discovery.agents.map(item => item.name)).toEqual(['Explore'])

    const opened = await gateway.handle({ id: 'open', method: 'sessions.open' }) as { sessionId: string }
    expect(opened.sessionId).toMatch(/^[a-f0-9-]{36}$/)

    await gateway.handle({ id: 'send', method: 'sessions.send',
      sessionId: opened.sessionId, message: 'approve' })
    await until(() => events.some(event => event.event === 'permission.request'))
    const pending = await gateway.handle({ id: 'permissions', method: 'permissions.list',
      sessionId: opened.sessionId }) as Array<{ id: string; toolName: string }>
    expect(pending).toHaveLength(1)
    expect(pending[0]?.toolName).toBe('Bash')
    const permissionId = pending[0]?.id
    if (!permissionId) throw new Error('SDK never requested tool permission')
    await gateway.handle({ id: 'allow', method: 'permissions.decide',
      sessionId: opened.sessionId, permissionId,
      decision: { behavior: 'allow', updatedInput: { command: 'pwd' } } })
    await until(() => events.some(event =>
      event.event === 'task.updated' && event.task.status === 'completed'))
    await until(() => events.some(event =>
      event.event === 'session.message' && event.message.type === 'result'))
    const tasks = await gateway.handle({ id: 'tasks', method: 'tasks.list',
      sessionId: opened.sessionId }) as DesktopTask[]
    expect(tasks[0]?.status).toBe('completed')
    expect(tasks[0]?.usage?.total_tokens).toBe(5)

    await gateway.handle({ id: 'interrupt-send', method: 'sessions.send',
      sessionId: opened.sessionId, message: 'interrupt' })
    await until(() => events.filter(event =>
      event.event === 'session.message' && event.message.type === 'system' &&
      event.message.subtype === 'task_started').length >= 2)
    await gateway.handle({ id: 'interrupt', method: 'sessions.interrupt', sessionId: opened.sessionId })
    await until(() => events.some(event =>
      event.event === 'session.message' && event.message.type === 'result' &&
      event.message.terminal_reason === 'aborted_streaming'))
    await gateway.handle({ id: 'close', method: 'sessions.close', sessionId: opened.sessionId })
    const resumed = await gateway.handle({ id: 'resume', method: 'sessions.resume',
      sessionId: opened.sessionId }) as { sessionId: string; resumed: boolean }
    expect(resumed.sessionId).toBe(opened.sessionId)
    expect(resumed.resumed).toBe(true)
  } finally {
    stop()
    await gateway.close()
    await rm(cwd, { recursive: true, force: true })
  }
})
