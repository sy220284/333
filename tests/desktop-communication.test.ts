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
import { projectTask, projectBackgroundTasks, isAgentProgress } from '../src/services/desktop/taskProjection.js'
import { SDKMessageSchema } from '../src/entrypoints/sdk/coreSchemas.js'
import type { SDKMessage } from '../src/entrypoints/sdk/coreTypes.js'
import type { SDKSessionInfo } from '../src/entrypoints/sdk/coreTypes.js'
import type { DesktopEvent, DesktopRequest } from '../src/services/desktop/protocol.js'
import type { DesktopTask } from '../src/services/desktop/taskProjection.js'
import type { DesktopGatewayOptions } from '../src/services/desktop/gateway.js'
import type { CanUseTool, HostControlRequestHandler } from '../src/entrypoints/sdk/runtimeTypes.js'

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
  let lastHostCallback: HostControlRequestHandler | undefined
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
  const launch = ((options: { canUseTool?: CanUseTool; onControlRequest?: HostControlRequestHandler }, resume?: string) => {
    lastToolCallback = options.canUseTool
    lastHostCallback = options.onControlRequest
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
    getHostCallback: () => lastHostCallback,
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
    await expect(gateway.handle(request('agents.members', { teamName: 'different-project-team' })))
      .rejects.toThrow('不属于当前项目')
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

test('超级智能体工作项从入队、真实 SDK 会话、人工审核到长期任务归档全链路可用', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'desktop-mission-dispatch-'))
  const missionRoot = join(cwd, 'private-store')
  const beforeMode = getConfiguredAgentMode()
  const beforeOverride = process.env.CLAUDE_CODE_COORDINATOR_MODE
  const data = fixture()
  const gateway = createDesktopGateway({ ...data.options, cwd, missionRoot })
  const events: DesktopEvent[] = []
  gateway.subscribe(event => events.push(event))
  try {
    const mission = await gateway.handle(request('missions.create', {
      objective: '运行完整的本地团队审查并汇总',
    })) as { id: string }
    const queued = await gateway.handle(request('missions.jobs.enqueue', {
      missionId: mission.id,
      title: '检查可复现缺陷',
      instruction: '请使用本地代理检测问题，再提供测试证据',
    })) as { id: string; status: string }
    expect(queued.status).toBe('queued')
    expect((await gateway.handle(request('agents.overview')) as { activeSessions: number }).activeSessions).toBe(0)
    const jobList = await gateway.handle(request('missions.jobs.list', { missionId: mission.id })) as Array<{ id: string }>
    expect(jobList.map(job => job.id)).toEqual([queued.id])
    await expect(gateway.handle(request('missions.updateStatus', {
      missionId: mission.id, status: 'completed',
    }))).rejects.toThrow('执行工作项尚未完成或审核')
    await gateway.handle(request('missions.updateStatus', { missionId: mission.id, status: 'paused' }))
    await expect(gateway.handle(request('missions.jobs.start', {
      missionId: mission.id, jobId: queued.id,
    }))).rejects.toThrow('已暂停')
    await gateway.handle(request('missions.updateStatus', { missionId: mission.id, status: 'active' }))
    const dispatched = await gateway.handle(request('missions.jobs.start', {
      missionId: mission.id, jobId: queued.id,
    })) as { sessionId: string; turnId: string; job: { attempt: number } }
    expect(dispatched.sessionId).toBeTruthy()
    expect(dispatched.turnId).toBeTruthy()
    expect(dispatched.job.attempt).toBe(1)
    await until(() => events.some(event =>
      event.event === 'mission.job.updated' && event.job.id === queued.id && event.job.status === 'review'))
    await expect(gateway.handle(request('missions.jobs.start', {
      missionId: mission.id, jobId: queued.id,
    }))).rejects.toThrow('不能执行')
    const approved = await gateway.handle(request('missions.jobs.approve', {
      missionId: mission.id, jobId: queued.id,
    })) as { status: string }
    expect(approved.status).toBe('completed')
    const completed = await gateway.handle(request('missions.updateStatus', {
      missionId: mission.id, status: 'completed',
    })) as { status: string }
    expect(completed.status).toBe('completed')
    const assignments = await gateway.handle(request('missions.get', { missionId: mission.id })) as {
      assignments: Array<{ status: string }>;
    }
    expect(assignments.assignments[0]?.status).toBe('completed')
    await gateway.close()
    const reopened = createDesktopGateway({ ...data.options, cwd, missionRoot })
    try {
      const jobs = await reopened.handle(request('missions.jobs.list', {
        missionId: mission.id,
      })) as Array<{ status: string; history: unknown[] }>
      expect(jobs[0]?.status).toBe('completed')
      expect(jobs[0]?.history).toHaveLength(1)
    } finally {
      await reopened.close()
    }
  } finally {
    selectMission(undefined, cwd)
    setAgentMode(beforeMode)
    if (beforeOverride === undefined) delete process.env.CLAUDE_CODE_COORDINATOR_MODE
    else process.env.CLAUDE_CODE_COORDINATOR_MODE = beforeOverride
    await gateway.close()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('一键并行分工只启动明确授权的工作项，并保留剩余队列', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'desktop-mission-batch-'))
  const missionRoot = join(cwd, 'mission-store')
  const beforeMode = getConfiguredAgentMode()
  const beforeOverride = process.env.CLAUDE_CODE_COORDINATOR_MODE
  const data = fixture()
  const gateway = createDesktopGateway({ ...data.options, cwd, missionRoot })
  const events: DesktopEvent[] = []
  gateway.subscribe(event => events.push(event))
  try {
    const mission = await gateway.handle(request('missions.create', { objective: '验证三项工作' })) as { id: string }
    const ids: string[] = []
    for (let index = 0; index < 3; index++) {
      const job = await gateway.handle(request('missions.jobs.enqueue', {
        missionId: mission.id, title: '工作' + index, instruction: '逐项独立验证' + index,
      })) as { id: string }
      ids.push(job.id)
    }
    const batch = await gateway.handle(request('missions.jobs.runBatch', {
      missionId: mission.id, limit: 2,
    })) as { launched: Array<{ jobId: string; ok: boolean }>; remaining: number }
    expect(batch.launched).toHaveLength(2)
    expect(batch.launched.every(item => item.ok)).toBe(true)
    expect(batch.remaining).toBe(1)
    await until(() => events.filter(event =>
      event.event === 'mission.job.updated' && event.job.status === 'review').length >= 2)
    const jobs = await gateway.handle(request('missions.jobs.list', { missionId: mission.id })) as Array<{ id: string; status: string }>
    expect(jobs.find(job => job.id === ids[2])?.status).toBe('queued')
    expect(() => request('missions.jobs.runBatch', {
      missionId: mission.id, limit: 4,
    })).toThrow()
  } finally {
    selectMission(undefined, cwd)
    setAgentMode(beforeMode)
    if (beforeOverride === undefined) delete process.env.CLAUDE_CODE_COORDINATOR_MODE
    else process.env.CLAUDE_CODE_COORDINATOR_MODE = beforeOverride
    await gateway.close()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('用户授权的持续任务队列自动补位、保持三项并发上限并允许终止', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'desktop-mission-queue-'))
  const missionRoot = join(cwd, 'mission-store')
  const previousMode = getConfiguredAgentMode()
  const previousOverride = process.env.CLAUDE_CODE_COORDINATOR_MODE
  const data = fixture()
  const gateway = createDesktopGateway({ ...data.options, cwd, missionRoot })
  const events: DesktopEvent[] = []
  gateway.subscribe(event => events.push(event))
  try {
    const mission = await gateway.handle(request('missions.create', { objective: '自动推进五项独立验证任务' })) as { id: string }
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      const job = await gateway.handle(request('missions.jobs.enqueue', {
        missionId: mission.id, title: '第' + i + '项工作', instruction: '核查项目单元' + i,
      })) as { id: string }
      ids.push(job.id)
    }
    expect((await gateway.handle(request('missions.jobs.queueStatus', { missionId: mission.id })) as { active: boolean }).active).toBe(false)
    const result = await gateway.handle(request('missions.jobs.runQueue', { missionId: mission.id })) as { active: boolean }
    expect(result.active).toBe(true)
    await until(() => new Set(events.filter(event =>
      event.event === 'mission.job.updated' && event.job.status === 'review').map(event =>
      event.event === 'mission.job.updated' ? event.job.id : null)).size === 5)
    await until(() => events.some(event => event.event === 'mission.queue.state' && event.active === false))
    const jobs = await gateway.handle(request('missions.jobs.list', { missionId: mission.id })) as Array<{ id: string; status: string; attempt: number }>
    expect(jobs.map(job => job.id).sort()).toEqual([...ids].sort())
    expect(jobs.every(job => job.status === 'review' && job.attempt === 1)).toBe(true)
    expect((await gateway.handle(request('missions.jobs.queueStatus', { missionId: mission.id })) as { active: boolean }).active).toBe(false)
    const stop = await gateway.handle(request('missions.jobs.haltQueue', { missionId: mission.id })) as { active: boolean }
    expect(stop.active).toBe(false)
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

test('SDK 2.1.317 task_updated patch merges and cannot regress terminal tasks', () => {
  const id = randomUUID()
  const started = {
    type: 'system', subtype: 'task_started', task_id: 'task-1',
    description: 'Background analysis', uuid: randomUUID(), session_id: id,
  } as SDKMessage
  const first = projectTask(started, undefined, 100)
  expect(first?.status).toBe('running')
  const patch = {
    type: 'system', subtype: 'task_updated', task_id: 'task-1',
    run_id: 'run-1',
    patch: {
      status: 'completed', summary: 'Analysis complete',
      is_backgrounded: true, end_time: 120, total_paused_ms: 10,
    },
    uuid: randomUUID(), session_id: id,
  } as unknown as SDKMessage
  expect(SDKMessageSchema().safeParse(patch).success).toBe(true)
  expect(isAgentProgress(patch)).toBe(true)
  const finished = projectTask(patch, first, 110)
  expect(finished).toMatchObject({
    taskId: 'task-1', status: 'completed',
    description: 'Background analysis', summary: 'Analysis complete',
    runId: 'run-1', isBackgrounded: true, endTime: 120, totalPausedMs: 10,
  })
  const late = projectTask(started, finished, 120)
  expect(late?.status).toBe('completed')
  const progress = {
    type: 'system', subtype: 'task_progress', task_id: 'task-1',
    description: '', usage: { total_tokens: 10, tool_uses: 1, duration_ms: 10 },
    uuid: randomUUID(), session_id: id,
  } as SDKMessage
  expect(projectTask(progress, finished, 130)?.status).toBe('completed')
  const background = {
    type: 'system', subtype: 'background_tasks_changed', tasks: [],
    uuid: randomUUID(), session_id: id,
  } as unknown as SDKMessage
  expect(SDKMessageSchema().safeParse(background).success).toBe(true)
  expect(isAgentProgress(background)).toBe(true)
  expect(projectTask(background, finished)).toBeUndefined()
})

test('task_progress updates description and timestamp while retaining terminal status', () => {
  const base = {
    taskId: 'task-1', description: '旧任务', status: 'running' as const,
    updatedAt: 100, toolUseId: 'tool-original',
  }
  const progress = {
    type: 'system', subtype: 'task_progress', task_id: 'task-1',
    description: '新进度', usage: { total_tokens: 20, tool_uses: 2, duration_ms: 30 },
  } as SDKMessage
  expect(projectTask(progress, base, 130)).toMatchObject({
    taskId: 'task-1', description: '新进度', status: 'running',
    updatedAt: 130, toolUseId: 'tool-original',
  })
  const terminal = { ...base, status: 'completed' as const }
  expect(projectTask(progress, terminal, 150)).toMatchObject({
    status: 'completed', updatedAt: 150, description: '新进度',
  })
})

test('desktop continues model events after a task journal write failure', async () => {
  const data = fixture()
  const disk = data.options.journal
  let writes = 0
  const gateway = createDesktopGateway({
    ...data.options,
    journal: {
      read: id => disk.read(id),
      async write(id, tasks) {
        if (++writes === 1) throw new Error('Simulated disk I/O failure')
        await disk.write(id, tasks)
      },
    },
  })
  const events: DesktopEvent[] = []
  gateway.subscribe(event => events.push(event))
  try {
    const opened = await gateway.handle(request('sessions.open')) as { sessionId: string }
    await gateway.handle(request('sessions.send', { sessionId: opened.sessionId, message: 'verify' }))
    await until(() => events.some(event =>
      event.event === 'session.message' && event.message.type === 'result'))
    await until(() => events.some(event => event.event === 'task.persistence.error'))
    expect(events.some(event => event.event === 'session.error')).toBe(false)
    const current = await gateway.handle(request('tasks.list', { sessionId: opened.sessionId })) as DesktopTask[]
    expect(current[0]?.status).toBe('completed')
    await gateway.handle(request('sessions.close', { sessionId: opened.sessionId }))
    const saved = await disk.read(opened.sessionId)
    expect(saved[0]?.status).toBe('completed')
    expect(writes).toBeGreaterThan(1)
  } finally {
    await gateway.close()
  }
})

test('host control requests stay scoped to their session and require explicit responses', async () => {
  const data = fixture()
  const gateway = createDesktopGateway(data.options)
  const events: DesktopEvent[] = []
  gateway.subscribe(event => events.push(event))
  try {
    const opened = await gateway.handle(request('sessions.open')) as { sessionId: string }
    const callback = data.getHostCallback()
    if (!callback) throw new Error('Missing host control callback')
    const signal = new AbortController()
    const reply = callback({
      subtype: 'elicitation', mcp_server_name: 'fixture-mcp',
      message: 'Choose a workspace', mode: 'form',
      requested_schema: { type: 'object' },
    }, { signal: signal.signal, requestId: 'host-1' })
    const pending = await gateway.handle(request('host.list', {
      sessionId: opened.sessionId,
    })) as Array<{ id: string; request: { subtype: string; mcp_server_name: string } }>
    expect(pending).toHaveLength(1)
    expect(pending[0]?.request.mcp_server_name).toBe('fixture-mcp')
    expect(events.some(event => event.event === 'host.request')).toBe(true)
    await expect(gateway.handle(request('host.respond', {
      sessionId: opened.sessionId, requestId: 'unknown', response: { action: 'accept' },
    }))).rejects.toThrow('expired')
    await expect(gateway.handle(request('host.respond', {
      sessionId: opened.sessionId, requestId: 'host-1', response: {},
    }))).rejects.toThrow()
    await gateway.handle(request('host.respond', {
      sessionId: opened.sessionId, requestId: 'host-1',
      response: { action: 'accept', content: { workspace: 'local' } },
    }))
    expect(await reply).toEqual({ action: 'accept', content: { workspace: 'local' } })
    expect(events.some(event => event.event === 'host.resolved')).toBe(true)
    const abort = new AbortController()
    const blocked = callback({ subtype: 'ui_prompt_read' }, {
      signal: abort.signal, requestId: 'host-2',
    })
    abort.abort()
    await expect(blocked).rejects.toThrow('cancelled')
    const cleared = await gateway.handle(request('host.list', {
      sessionId: opened.sessionId,
    })) as unknown[]
    expect(cleared).toHaveLength(0)
  } finally {
    await gateway.close()
  }
})

test('background_tasks_changed reconciles active work without inventing completion', () => {
  const session = randomUUID()
  const existing = new Map<string, DesktopTask>([
    ['agent-1', {
      taskId: 'agent-1', description: 'Prior task',
      status: 'running', updatedAt: 10, isBackgrounded: true,
    }],
    ['agent-done', {
      taskId: 'agent-done', description: 'Completed task',
      status: 'completed', updatedAt: 10, isBackgrounded: true,
    }],
  ])
  const snapshot = {
    type: 'system', subtype: 'background_tasks_changed',
    tasks: [
      { task_id: 'agent-2', task_type: 'local_agent', status: 'running' },
      { task_id: 'agent-done', status: 'running' },
    ],
    session_id: session, uuid: randomUUID(),
  } as SDKMessage
  expect(SDKMessageSchema().safeParse(snapshot).success).toBe(true)
  const updates = projectBackgroundTasks(snapshot, existing, 200)
  expect(updates).toHaveLength(3)
  expect(updates.find(x => x.taskId === 'agent-2')).toMatchObject({
    status: 'running', taskType: 'local_agent', isBackgrounded: true,
  })
  expect(updates.find(x => x.taskId === 'agent-done')).toMatchObject({
    status: 'completed', isBackgrounded: true,
  })
  expect(updates.find(x => x.taskId === 'agent-1')).toMatchObject({
    status: 'running', isBackgrounded: false,
  })
})
