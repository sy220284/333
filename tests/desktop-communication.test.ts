import { expect, test } from 'bun:test'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHeadlessConversationSession } from '../src/services/conversation/headlessSession.js'
import { createDesktopGateway } from '../src/services/desktop/gateway.js'
import { createDesktopTaskJournal } from '../src/services/desktop/taskJournal.js'
import { createMission, selectMission } from '../src/utils/agentMissions.js'
import { getConfiguredAgentMode, setAgentMode } from '../src/utils/agentMode.js'
import { DesktopRequestSchema } from '../src/services/desktop/protocol.js'
import { projectTask } from '../src/services/desktop/taskProjection.js'
import type { SDKMessage } from '../src/entrypoints/sdk/coreTypes.js'
import type { SDKSessionInfo } from '../src/entrypoints/sdk/coreTypes.js'
import type { DesktopEvent, DesktopRequest } from '../src/services/desktop/protocol.js'
import type { DesktopTask } from '../src/services/desktop/taskProjection.js'
import type { DesktopGatewayOptions } from '../src/services/desktop/gateway.js'
import type { CanUseTool } from '../src/entrypoints/sdk/runtimeTypes.js'

async function until(ready: () => boolean) {
  const deadline = Date.now() + 1500
  while (!ready()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for desktop event')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}
function request(method: DesktopRequest['method'], data: Record<string, unknown> = {}): DesktopRequest {
  return DesktopRequestSchema.parse({ id: randomUUID(), method, ...data })
}
function fixture(fixtureOptions: { beforeSend?: () => Promise<void> } = {}) {
  let lastToolCallback: CanUseTool | undefined
  let lastControl: Record<string, unknown> | undefined
  const transcriptIds = new Set<string>()
  const store = new Map<string, DesktopTask[]>()
  const history: NonNullable<DesktopGatewayOptions['history']> = {
    async listSessions() {
      return [...transcriptIds].map(sessionId => ({
        sessionId, summary: 'fixture session', lastModified: 10,
      })) as SDKSessionInfo[]
    },
    async getSessionInfo(sessionId) {
      return transcriptIds.has(sessionId)
        ? { sessionId, summary: 'fixture session', lastModified: 10 } : undefined
    },
    async getSessionMessages() { return [] },
  }
  const journal = {
    async read(id: string) {
      return (store.get(id) ?? []).map(task =>
        task.status === 'running' ? { ...task, status: 'interrupted' as const } : task)
    },
    async write(id: string, tasks: DesktopTask[]) { store.set(id, tasks) },
  }
  const launch = ((options: { canUseTool?: CanUseTool }, resume?: string) => {
    lastToolCallback = options.canUseTool
    const sessionId = resume ?? randomUUID()
    transcriptIds.add(sessionId)
    let content = ''
    return {
      sessionId,
      initialization: Promise.resolve({
        models: [{ value: 'fixture-model', displayName: 'Fixture Model', description: 'Local SDK fixture' }],
        agents: [{ name: 'Explore', description: 'Finds files' }],
      }),
      async send(input: string) {
        if (fixtureOptions.beforeSend) await fixtureOptions.beforeSend()
        content = input
      },
      async *stream() {
        const base = { session_id: sessionId, uuid: randomUUID() }
        const started = { type: 'system', subtype: 'task_started',
          task_id: 'agent-1', description: 'Search source', ...base }
        yield started
        yield { type: 'tool_progress', task_id: 'agent-1', tool_name: 'Agent',
          tool_use_id: 'tool-1', parent_tool_use_id: null, elapsed_time_seconds: 1, ...base }
        yield { type: 'system', subtype: 'task_progress', task_id: 'agent-1',
          description: 'Search source', usage: { total_tokens: 42, tool_uses: 2, duration_ms: 90 }, ...base }
        if (content !== 'incomplete') yield { type: 'system', subtype: 'task_notification',
          task_id: 'agent-1', status: 'completed', output_file: '/tmp/out',
          summary: 'Done', ...base }
        yield { type: 'result', subtype: 'success', is_error: false,
          terminal_reason: 'completed', result: 'done', ...base }
      },
      async control(req: Record<string, unknown>) { lastControl = req; return {} },
      close() {},
      async closeAndWait() {},
    }
  }) as unknown as typeof import('../src/entrypoints/sdk/sessionRuntime317.js').createSessionRuntime317
  return {
    options: {
      model: 'fixture-model', history, journal,
      createSession: (options, resume) => createHeadlessConversationSession(options, resume, launch),
    } satisfies DesktopGatewayOptions,
    getToolCallback: () => lastToolCallback,
    getControl: () => lastControl,
  }
}

test('desktop request protocol validates tool approvals and rejects unknown methods', () => {
  expect(DesktopRequestSchema.safeParse({ id: 'one', method: 'hello' }).success).toBe(true)
  expect(DesktopRequestSchema.safeParse({ id: 'one', method: 'unknown' }).success).toBe(false)
  expect(DesktopRequestSchema.safeParse({
    id: 'one', method: 'permissions.decide', sessionId: randomUUID(), permissionId: 'x',
    decision: { behavior: 'allow', updatedInput: { command: 'ls' } },
  }).success).toBe(true)
  expect(DesktopRequestSchema.safeParse({
    id: 'one', method: 'permissions.decide', sessionId: randomUUID(), permissionId: 'x',
    decision: { behavior: 'ask' },
  }).success).toBe(false)
})

test('desktop model discovery and multi-turn streaming use SDK initialization and native events', async () => {
  const fixtureData = fixture()
  const gateway = createDesktopGateway(fixtureData.options)
  const events: DesktopEvent[] = []
  const stop = gateway.subscribe(event => events.push(event))
  try {
    const models = await gateway.handle(request('models.list')) as { models: Array<{ value: string }> }
    expect(models.models[0]?.value).toBe('fixture-model')
    const opened = await gateway.handle(request('sessions.open')) as { sessionId: string; agents: unknown[] }
    expect(opened.agents).toHaveLength(1)
    const turn = await gateway.handle(request('sessions.send', { sessionId: opened.sessionId, message: 'investigate' })) as { turnId: string }
    expect(turn.turnId).toBeTruthy()
    await until(() => events.some(event => event.event === 'task.updated' && event.task.status === 'completed'))
    const streamed = events.filter(event => event.event === 'session.message')
    expect(streamed.map(event => event.event === 'session.message' ? event.message.type : null))
      .toContain('tool_progress')
    expect(events.filter(event => event.event === 'agent.progress').length).toBeGreaterThanOrEqual(3)
    const tasks = await gateway.handle(request('tasks.list', { sessionId: opened.sessionId })) as DesktopTask[]
    expect(tasks[0]?.usage?.total_tokens).toBe(42)
    expect(tasks[0]?.status).toBe('completed')
    await gateway.handle(request('sessions.setModel', { sessionId: opened.sessionId, model: 'fixture-model' }))
    expect(fixtureData.getControl()).toEqual({ subtype: 'set_model', model: 'fixture-model' })
    await gateway.handle(request('sessions.close', { sessionId: opened.sessionId }))
  } finally {
    stop()
    await gateway.close()
  }
})

test('SDK callback permissions require a matching per-session desktop decision and can be interrupted', async () => {
  const data = fixture()
  const gateway = createDesktopGateway(data.options)
  const events: DesktopEvent[] = []
  gateway.subscribe(event => events.push(event))
  try {
    const opened = await gateway.handle(request('sessions.open')) as { sessionId: string }
    const callback = data.getToolCallback()
    if (!callback) throw new Error('Missing SDK permission callback')
    const one = callback('Bash', { command: 'touch important' }, { signal: new AbortController().signal })
    const pending = await gateway.handle(request('permissions.list', { sessionId: opened.sessionId })) as Array<{ id: string }>
    expect(pending).toHaveLength(1)
    expect(events.some(event => event.event === 'permission.request')).toBe(true)
    await expect(gateway.handle(request('permissions.decide', {
      sessionId: opened.sessionId, permissionId: 'invalid', decision: { behavior: 'allow' },
    }))).rejects.toThrow('expired')
    await gateway.handle(request('permissions.decide', {
      sessionId: opened.sessionId, permissionId: pending[0]?.id,
      decision: { behavior: 'deny', message: 'User rejected' },
    }))
    expect((await one).behavior).toBe('deny')
    expect(events.some(event => event.event === 'permission.resolved')).toBe(true)
    const two = callback('Bash', { command: 'pwd' }, { signal: new AbortController().signal })
    await gateway.handle(request('sessions.interrupt', { sessionId: opened.sessionId }))
    expect((await two).behavior).toBe('deny')
    expect(data.getControl()).toBeUndefined()
    await expect(gateway.handle(request('sessions.setPermissionMode', {
      sessionId: opened.sessionId, mode: 'bypassPermissions',
    }))).rejects.toThrow('explicit host')
  } finally { await gateway.close() }
})

test('desktop restores an interrupted task after reopening its persisted SDK session', async () => {
  const data = fixture()
  const first = createDesktopGateway(data.options)
  const opened = await first.handle(request('sessions.open')) as { sessionId: string }
  const events: DesktopEvent[] = []
  first.subscribe(event => events.push(event))
  await first.handle(request('sessions.send', { sessionId: opened.sessionId, message: 'incomplete' }))
  await until(() => events.some(event => event.event === 'task.updated'))
  await first.close()
  const restored = createDesktopGateway(data.options)
  try {
    const history = await restored.handle(request('sessions.list')) as SDKSessionInfo[]
    expect(history.some(item => item.sessionId === opened.sessionId)).toBe(true)
    const tasks = await restored.handle(request('tasks.list', { sessionId: opened.sessionId })) as DesktopTask[]
    expect(tasks[0]?.status).toBe('interrupted')
    const resume = await restored.handle(request('tasks.resume', {
      sessionId: opened.sessionId, taskId: 'agent-1',
    })) as { action: string; restored: boolean }
    expect(resume.action).toBe('context_restored')
    expect(resume.restored).toBe(true)
    const continued = await restored.handle(request('tasks.resume', {
      sessionId: opened.sessionId, taskId: 'agent-1', prompt: 'finish the work',
    })) as { action: string; turnId: string }
    expect(continued.action).toBe('continued')
    expect(continued.turnId).toBeTruthy()
  } finally { await restored.close() }
})

test('SDK task projector preserves terminal status and recovery journal persists private local snapshots', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'desktop-journal-'))
  try {
    const taskJournal = createDesktopTaskJournal(cwd, join(cwd, 'state'))
    const id = randomUUID()
    const task: DesktopTask = { taskId: 'a', description: 'Long task', status: 'running', updatedAt: Date.now() }
    await taskJournal.write(id, [task])
    const fromDisk = await taskJournal.read(id)
    expect(fromDisk[0]?.status).toBe('interrupted')
    const done = projectTask({
      type: 'system', subtype: 'task_notification', task_id: 'a', status: 'completed',
      output_file: '', summary: 'Finished', uuid: randomUUID(), session_id: id,
    } as SDKMessage, task)
    expect(done?.status).toBe('completed')
  } finally { await rm(cwd, { recursive: true, force: true }) }
})

test('a failed desktop journal write reports its error and later writes recover', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'desktop-journal-recover-'))
  try {
    const stateRoot = join(cwd, 'state')
    const journal = createDesktopTaskJournal(cwd, stateRoot)
    const sessionId = randomUUID()
    const workspace = createHash('sha256').update(resolve(cwd)).digest('hex')
    const journalFile = join(stateRoot, workspace, `${sessionId}.json`)
    // A directory at the target file path makes rename() fail after the
    // temporary snapshot was written, exercising an actual filesystem error.
    await mkdir(journalFile, { recursive: true })
    const running: DesktopTask = {
      taskId: 'recover-1', description: 'Interrupted task',
      status: 'running', updatedAt: Date.now(),
    }
    await expect(journal.write(sessionId, [running])).rejects.toThrow()
    await rm(journalFile, { recursive: true })
    await journal.write(sessionId, [{ ...running, status: 'completed' }])
    expect((await journal.read(sessionId))[0]?.status).toBe('completed')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('desktop agent center manages project-scoped missions and teams through one protocol', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'desktop-agent-center-'))
  const missionRoot = join(cwd, 'mission-data')
  const previousMode = getConfiguredAgentMode()
  const previousOverride = process.env.CLAUDE_CODE_COORDINATOR_MODE
  const data = fixture()
  const gateway = createDesktopGateway({ ...data.options, cwd, missionRoot })
  try {
    const initial = await gateway.handle(request('agents.overview')) as {
      missions: Array<{ id: string }>; teams: Array<{ name: string }>;
      activeSessions: number;
    }
    expect(initial.missions).toHaveLength(0)
    expect(initial.teams).toEqual([])
    expect(initial.activeSessions).toBe(0)
    const created = await gateway.handle(request('missions.create', { objective: 'Finish verified code review' })) as {
      id: string; objective: string;
    }
    expect(created.id).toMatch(/^mission_[a-f0-9]{16}$/)
    const index = await gateway.handle(request('missions.list')) as {
      selectedMissionId: string; missions: Array<{ id: string }>;
    }
    expect(index.selectedMissionId).toBe(created.id)
    expect(index.missions.map(mission => mission.id)).toEqual([created.id])
    const overview = await gateway.handle(request('agents.overview')) as { mode: string; selectedMissionId: string }
    expect(overview.mode).toBe('super')
    expect(overview.selectedMissionId).toBe(created.id)
    await gateway.handle(request('agents.setMode', { mode: 'master' }))
    const mode = await gateway.handle(request('agents.setMode', { mode: 'super' })) as { mode: string }
    expect(mode.mode).toBe('super')

    const other = await createMission('Other workspace', join(cwd, 'different-project'), missionRoot)
    await expect(gateway.handle(request('missions.get', { missionId: other.id })))
      .rejects.toThrow('different workspace')
    await expect(gateway.handle(request('missions.select', { missionId: other.id })))
      .rejects.toThrow('different workspace')
    const checkpoint = await gateway.handle(request('missions.checkpoint', {
      missionId: created.id, checkpoint: 'One stage verified',
    })) as { checkpoint: string }
    expect(checkpoint.checkpoint).toBe('One stage verified')
    const paused = await gateway.handle(request('missions.updateStatus', {
      missionId: created.id, status: 'paused',
    })) as { status: string }
    expect(paused.status).toBe('paused')
    const resumed = await gateway.handle(request('missions.updateStatus', {
      missionId: created.id, status: 'active',
    })) as { status: string }
    expect(resumed.status).toBe('active')
    const completed = await gateway.handle(request('missions.updateStatus', {
      missionId: created.id, status: 'completed',
    })) as { status: string }
    expect(completed.status).toBe('completed')
    const persisted = await gateway.handle(request('missions.get', { missionId: created.id })) as {
      status: string; checkpoint: string;
    }
    expect(persisted).toMatchObject({ status: 'completed', checkpoint: 'One stage verified' })
    const cleared = await gateway.handle(request('missions.select', { missionId: null })) as {
      selectedMissionId: string | null;
    }
    expect(cleared.selectedMissionId).toBeNull()
  } finally {
    selectMission(undefined, cwd)
    setAgentMode(previousMode)
    if (previousOverride === undefined) delete process.env.CLAUDE_CODE_COORDINATOR_MODE
    else process.env.CLAUDE_CODE_COORDINATOR_MODE = previousOverride
    await gateway.close()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('desktop serializes concurrent turns even while the first SDK send is pending', async () => {
  let permit!: () => void
  const sending = new Promise<void>(resolve => { permit = resolve })
  const data = fixture({ beforeSend: () => sending })
  const gateway = createDesktopGateway(data.options)
  const events: DesktopEvent[] = []
  gateway.subscribe(event => events.push(event))
  try {
    const opened = await gateway.handle(request('sessions.open')) as { sessionId: string }
    const first = gateway.handle(request('sessions.send', {
      sessionId: opened.sessionId, message: 'first',
    }))
    await expect(gateway.handle(request('sessions.send', {
      sessionId: opened.sessionId, message: 'second',
    }))).rejects.toThrow('A turn is already being consumed')
    permit()
    await first
    await until(() => events.some(event => event.event === 'task.updated' && event.task.status === 'completed'))
    await gateway.handle(request('sessions.close', { sessionId: opened.sessionId }))
  } finally {
    permit()
    await gateway.close()
  }
})

test('closing a desktop session while SDK send is pending rejects the delayed turn', async () => {
  let permit!: () => void
  const sending = new Promise<void>(resolve => { permit = resolve })
  const data = fixture({ beforeSend: () => sending })
  const gateway = createDesktopGateway(data.options)
  const opened = await gateway.handle(request('sessions.open')) as { sessionId: string }
  const first = gateway.handle(request('sessions.send', {
    sessionId: opened.sessionId, message: 'pending',
  }))
  // Start close while the SDK send is still pending, then release the
  // simulated transport. Await the rejection only after both operations
  // were allowed to advance; this probes the actual close/send race.
  const closing = gateway.handle(request('sessions.close', { sessionId: opened.sessionId }))
  permit()
  await expect(first).rejects.toThrow('Desktop session closed during send')
  await closing
  await gateway.close()
})

test('desktop close cancels a stalled SDK send without waiting for the backend promise to resolve', async () => {
  let started!: () => void
  const entered = new Promise<void>(resolve => { started = resolve })
  const blocked = new Promise<void>(() => {})
  const data = fixture({ beforeSend: () => { started(); return blocked } })
  const gateway = createDesktopGateway(data.options)
  const opened = await gateway.handle(request('sessions.open')) as { sessionId: string }
  const sending = gateway.handle(request('sessions.send', {
    sessionId: opened.sessionId, message: 'blocked',
  }))
  // Wait for the SDK transport to actually enter the blocked send. Otherwise
  // the close/send ordering depends on microtask scheduling, making a
  // permanently pending mock appear to be a gateway shutdown deadlock.
  await entered
  // Close first while the underlying SDK send is still blocked. The
  // cancelled desktop send must settle once closing is complete.
  const closing = gateway.handle(request('sessions.close', { sessionId: opened.sessionId }))
  await closing
  await expect(sending).rejects.toThrow('Desktop session closed during send')
  await gateway.close()
})
