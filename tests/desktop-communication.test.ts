import { expect, test } from 'bun:test'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHeadlessConversationSession } from '../src/services/conversation/headlessSession.js'
import { createSessionRuntime317 } from '../src/entrypoints/sdk/sessionRuntime317.js'
import { createDesktopGateway } from '../src/services/desktop/gateway.js'
import { previewWorktreeIntegration, integrateWorktree } from '../src/services/agentCenter/worktreeIntegration.js'
import { createProjectBudget } from '../src/services/agentCenter/projectBudget.js'
import { createDesktopTaskJournal } from '../src/services/desktop/taskJournal.js'
import { createMission, getMission, linkMissionAssignment, selectMission } from '../src/utils/agentMissions.js'
import { enqueueMissionJob, approveMissionJob, missionJobAssignmentId } from '../src/services/agentCenter/missionJobs.js'
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

function requiredIndex<T>(values:readonly T[],index:number):T{
  const value=values[index]
  if(value===undefined)throw new Error(`测试预期存在索引 ${index}，但数据缺失`)
  return value
}
function requiredValue<T>(value:T|undefined,label:string):T{
  if(value===undefined)throw new Error(`测试必要依赖缺失：${label}`)
  return value
}
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
function fixture(fixtureOptions: { beforeSend?: () => Promise<void>; leaveTaskRunning?: boolean } = {}) {
  let lastToolCallback: CanUseTool | undefined
  let lastHostCallback: HostControlRequestHandler | undefined
  let lastControl: Record<string, unknown> | undefined
  const launchEnvironments: Array<Record<string, string | undefined>> = []
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
  const launch = ((options: { canUseTool?: CanUseTool; onControlRequest?: HostControlRequestHandler; env?: Record<string, string | undefined> }, resume?: string) => {
    launchEnvironments.push({ ...options.env })
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
        if (content !== 'incomplete' && !fixtureOptions.leaveTaskRunning) yield { type: 'system', subtype: 'task_notification',
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
      // The fixture has no Git repo; production uses the original worktree creator.
      prepareMissionJobWorkspace: async (_job, cwd) => ({ cwd }),
    } satisfies DesktopGatewayOptions,
    getToolCallback: () => lastToolCallback,
    getHostCallback: () => lastHostCallback,
    getControl: () => lastControl,
    getLaunchEnvironments: () => launchEnvironments,
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
    const ensured = await gateway.handle(request('sessions.ensureOpen', { sessionId: opened.sessionId })) as {sessionId:string;resumed:boolean}
    expect(ensured).toMatchObject({sessionId:opened.sessionId,resumed:false})
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
    expect(continued.action).toBe('continuation_requested')
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

test('SDK rejects conflicting permission providers and identical model fallback before spawn', () => {
  expect(() => createSessionRuntime317({
    model: 'model-example', fallbackModel: 'model-example',
  })).toThrow('Fallback model cannot be the same as the main model')
  expect(() => createSessionRuntime317({
    model: 'model-example', permissionPromptToolName: 'stdio',
    canUseTool: async () => ({ behavior: 'deny', message: 'Test rejection' }),
  })).toThrow('canUseTool callback cannot be used with permissionPromptToolName')
})

test('SDK preset tools and hook events reach the spawned CLI process', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sdk-startup-args-'))
  const script = join(cwd, 'sdk-args.cjs')
  const argsPath = join(cwd, 'args.json')
  const fixtureScript = [
    "const { writeFileSync } = require('node:fs')",
    "const { createInterface } = require('node:readline')",
    "writeFileSync(process.env.SDK_TEST_ARGS_PATH, JSON.stringify(process.argv.slice(2)))",
    "createInterface({ input: process.stdin }).on('line', line => {",
    "  const frame = JSON.parse(line)",
    "  if (frame.type === 'control_request') {",
    "    process.stdout.write(JSON.stringify({ type: 'control_response', response: {",
    "      subtype: 'success', request_id: frame.request_id, response: {}",
    "    } }) + '\\n')",
    "  }",
    "})",
  ].join('\n')
  await writeFile(script, fixtureScript)
  const session = createSessionRuntime317({
    model: 'model-example',
    cwd,
    pathToClaudeCodeExecutable: script,
    env: { SDK_TEST_ARGS_PATH: argsPath },
    tools: { type: 'preset', preset: 'claude_code' },
    includeHookEvents: true,
    plugins: [
      { type: 'local', path: join(cwd, 'no-mcp-plugin'), skipMcpDiscovery: true },
      { type: 'local', path: join(cwd, 'full-plugin') },
    ],
  })
  try {
    await session.initialization
    const args = JSON.parse(await readFile(argsPath, 'utf8')) as string[]
    expect(args).toContain('--tools=default')
    expect(args).toContain('--include-hook-events')
    expect(args).toContain('--plugin-dir-no-mcp')
    expect(args).toContain(join(cwd, 'no-mcp-plugin'))
    expect(args).toContain('--plugin-dir')
    expect(args).toContain(join(cwd, 'full-plugin'))
    expect(args).toContain('--model')
    expect(args).toContain('model-example')
  } finally {
    await session.closeAndWait()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('SDK closeAndWait allows the CLI to finish delayed session persistence after stdin EOF', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sdk-graceful-exit-'))
  const script = join(cwd, 'sdk-flush.cjs')
  const marker = join(cwd, 'session-flushed.txt')
  const fixtureScript = [
    "const { writeFileSync } = require('node:fs')",
    "const { createInterface } = require('node:readline')",
    "const input = createInterface({ input: process.stdin })",
    "input.on('line', line => {",
    "  const frame = JSON.parse(line)",
    "  if (frame.type === 'control_request') {",
    "    process.stdout.write(JSON.stringify({ type: 'control_response', response: {",
    "      subtype: 'success', request_id: frame.request_id, response: {}",
    "    } }) + '\\n')",
    "  }",
    "})",
    "input.on('close', () => setTimeout(() => {",
    "  writeFileSync(process.env.SDK_TEST_FLUSH_PATH, 'fully-persisted')",
    "  process.exit(0)",
    "}, 80))",
  ].join('\n')
  await writeFile(script, fixtureScript)
  const session = createSessionRuntime317({
    cwd,
    model: 'model-example',
    pathToClaudeCodeExecutable: script,
    env: { SDK_TEST_FLUSH_PATH: marker },
  })
  try {
    await session.initialization
    await session.closeAndWait()
    expect(await readFile(marker, 'utf8')).toBe('fully-persisted')
  } finally {
    session.close()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('SDK 2.1.317 task_updated and background metadata survive desktop restart', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'desktop-task-metadata-'))
  try {
    const journal = createDesktopTaskJournal(cwd, join(cwd, 'state'))
    const sessionId = randomUUID()
    const update = {
      type: 'system', subtype: 'task_updated', task_id: 'agent-2',
      run_id: 'run-2',
      patch: {
        status: 'running', description: 'Reviewing changes',
        is_backgrounded: true, end_time: 310,
        total_paused_ms: 24, error: { code: 'E_RETRY' },
      },
      uuid: randomUUID(), session_id: sessionId,
    } as unknown as SDKMessage
    expect(SDKMessageSchema().safeParse(update).success).toBe(true)
    const task = requiredValue(projectTask(update, undefined, 300), 'task_updated projection')
    await journal.write(sessionId, [task])
    const [restored] = await journal.read(sessionId)
    expect(restored).toMatchObject({
      taskId: 'agent-2', description: 'Reviewing changes',
      status: 'interrupted', runId: 'run-2', isBackgrounded: true,
      endTime: 310, totalPausedMs: 24, error: { code: 'E_RETRY' },
    })
    const resumed = requiredValue(projectTask({
      type: 'system', subtype: 'task_notification', task_id: 'agent-2',
      status: 'completed', uuid: randomUUID(), session_id: sessionId,
    } as SDKMessage, restored, 350), 'task completion projection')
    expect(resumed.status).toBe('completed')
    await journal.write(sessionId, [resumed])
    expect((await journal.read(sessionId))[0]).toMatchObject({
      status: 'completed', runId: 'run-2', isBackgrounded: true,
      endTime: 310, totalPausedMs: 24,
    })
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
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
    const initialMode = (await gateway.handle(request('agents.overview')) as { mode: string }).mode
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
    expect(overview.mode).toBe(initialMode)
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
    expect(data.getLaunchEnvironments().at(-1)?.CLAUDE_CODE_COORDINATOR_MODE).toBe('1')
    expect(process.env.CLAUDE_CODE_COORDINATOR_MODE).toBe(beforeOverride)
    expect(getConfiguredAgentMode()).toBe(beforeMode)
    await until(() => events.some(event =>
      event.event === 'mission.job.updated' && event.job.id === queued.id && event.job.status === 'review'))
    expect(events.some(event =>
      event.event === 'mission.activity' && event.jobId === queued.id &&
      event.sessionId === dispatched.sessionId && event.task.taskId === 'agent-1')).toBe(true)
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

test('主会话成功但后台智能体未结束时不能审核通过，保留需要检查的中断状态',async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'desktop-unfinished-worker-'))
  const root=join(cwd,'private-store')
  const data=fixture({leaveTaskRunning:true})
  const gateway=createDesktopGateway({...data.options,cwd,missionRoot:root})
  const events:DesktopEvent[]=[]
  gateway.subscribe(event=>events.push(event))
  try{
    const mission=await gateway.handle(request('missions.create',{objective:'核对后台任务终态'})) as {id:string}
    const job=await gateway.handle(request('missions.jobs.enqueue',{
      missionId:mission.id,title:'后台执行中',instruction:'执行并报告工具完成通知',
    })) as {id:string}
    await gateway.handle(request('missions.jobs.start',{missionId:mission.id,jobId:job.id}))
    await until(()=>events.some(event=>event.event==='mission.job.updated'&&
      event.job.id===job.id&&event.job.status==='interrupted'))
    const items=await gateway.handle(request('missions.jobs.list',{missionId:mission.id})) as Array<{status:string}>
    expect(items[0]?.status).toBe('interrupted')
    await expect(gateway.handle(request('missions.jobs.approve',{
      missionId:mission.id,jobId:job.id,
    }))).rejects.toThrow('待审核结果')
  }finally{
    await gateway.close()
    await rm(cwd,{recursive:true,force:true})
  }
})

test('宿主重启时从已写入的 Job 终态恢复 Mission 关联，不重复调用模型', async () => {
  const cwd=await mkdtemp(join(tmpdir(),'desktop-mission-repair-'))
  const missionRoot=join(cwd,'private-store')
  const data=fixture()
  const gateway=createDesktopGateway({...data.options,cwd,missionRoot})
  try {
    const mission=await createMission('验证崩溃写入修复',cwd,missionRoot)
    const job=await enqueueMissionJob(mission.id,cwd,'已审核工作项','确认审核持久化',missionRoot)
    await linkMissionAssignment(mission.id,missionJobAssignmentId(job.id),'agent',job.title,missionRoot)
    // A post-approval crash may leave two atomically written journals out of sync.
    const {claimMissionJob,settleMissionJob}=await import('../src/services/agentCenter/missionJobs.js')
    const claimed=await claimMissionJob(mission.id,cwd,job.id,randomUUID(),process.pid,missionRoot)
    if(!claimed.runId)throw new Error('未获取任务运行标识')
    await settleMissionJob(mission.id,cwd,job.id,claimed.runId,'review','检查已完成',missionRoot)
    await approveMissionJob(mission.id,cwd,job.id,missionRoot)
    expect((await getMission(mission.id,missionRoot)).assignments[0]?.status).toBe('running')
    const result=await gateway.handle(request('missions.get',{missionId:mission.id})) as {
      assignments:Array<{status:string}>
    }
    expect(result.assignments[0]?.status).toBe('completed')
    expect((await getMission(mission.id,missionRoot)).assignments[0]?.status).toBe('completed')
    expect(data.getLaunchEnvironments()).toHaveLength(0)
  }finally{
    await gateway.close()
    await rm(cwd,{recursive:true,force:true})
  }
})

test('多个宿主共享项目预算：并发预占不会超额，费用结算与未知账目持续受控',async()=>{
  const root=await mkdtemp(join(tmpdir(),'desktop-shared-project-budget-'))
  try{
    const first=createProjectBudget(root,root)
    const second=createProjectBudget(root,root)
    expect((await first.configure(1.2)).limitUsd).toBe(1.2)
    const id=Array.from({length:8},()=>randomUUID())
    const checked=await Promise.allSettled(id.map((value,index)=>
      (index%2?second:first).reserve(value,0.4)))
    const succeeded=checked.flatMap((x,i)=>x.status==='fulfilled'&&x.value.id?[requiredIndex(id,i)]:[])
    expect(succeeded).toHaveLength(3)
    expect(checked.filter(x=>x.status==='rejected')).toHaveLength(5)
    const total=await first.get()
    expect(total.reservedUsd).toBeCloseTo(1.2,5)
    expect(total.availableUsd).toBeCloseTo(0,5)
    await second.charge(requiredIndex(succeeded,0),0.11)
    expect((await first.get()).spentUsd).toBeCloseTo(0.11,5)
    await first.finish(requiredIndex(succeeded,0),false)
    expect((await second.get()).availableUsd).toBeCloseTo(0.29,5)
    await first.finish(requiredIndex(succeeded,1),true)
    const uncertain=await second.get()
    expect(uncertain.uncertainReservations).toBe(1)
    expect(uncertain.reservedUsd).toBeCloseTo(0.8,5)
    expect(uncertain.uncertain[0]?.reservedUsd).toBeCloseTo(0.4,5)
    await expect(second.configure(0.5)).rejects.toThrow('低于已使用')
    await second.configure(2)
    expect((await first.get()).limitUsd).toBe(2)
    const fixed=await first.resolveUnknown(requiredIndex(succeeded,1),0.22)
    expect(fixed.uncertainReservations).toBe(0)
    expect(fixed.spentUsd).toBeCloseTo(0.33,5)
    await expect(first.resolveUnknown(requiredIndex(succeeded,1),0)).rejects.toThrow('不存在')
  }finally{await rm(root,{recursive:true,force:true})}
})

test('真实 Git 工作树冲突预检、源代码保护、原子合并与幂等识别',async()=>{
  const root=await mkdtemp(join(tmpdir(),'worktree-integration-real-'))
  const project=join(root,'project')
  const worker=join(root,'worker')
  await mkdir(project,{recursive:true})
  function git(where:string,...args:string[]):string {
    return execFileSync('git',args,{cwd:where,encoding:'utf8'}).trim()
  }
  try {
    git(project,'init','-b','main')
    git(project,'config','user.email','test@example.invalid')
    git(project,'config','user.name','测试用户')
    await writeFile(join(project,'README.md'),'initial\n')
    git(project,'add','README.md');git(project,'commit','-m','start')
    const baseline=git(project,'rev-parse','HEAD')
    git(project,'worktree','add','-b','agent-work',worker)
    await writeFile(join(worker,'agent-file.ts'),'export const value = 1\n')
    git(worker,'add','agent-file.ts');git(worker,'commit','-m','agent output')
    const preview=await previewWorktreeIntegration(project,worker,baseline)
    expect(preview.canIntegrate).toBe(true)
    expect(preview.changes).toContain('agent-file.ts')
    expect(preview.mergeTree).toMatch(/^[a-f0-9]{40}$/)
    const merged=await integrateWorktree(project,worker,baseline,
      preview.targetHead,preview.sourceHead,root)
    expect(merged.alreadyIntegrated).toBe(false)
    expect(git(project,'rev-parse','HEAD')).toBe(merged.mergeCommit)
    expect(await readFile(join(project,'agent-file.ts'),'utf8')).toContain('value = 1')
    expect(git(project,'status','--porcelain')).toBe('')
    const repeat=await previewWorktreeIntegration(project,worker,baseline)
    expect(repeat.alreadyIntegrated).toBe(true)

    // Start a new task from the merged main and create a genuine conflict.
    const other=join(root,'worker-conflict')
    const newBase=git(project,'rev-parse','HEAD')
    git(project,'worktree','add','-b','agent-conflict',other)
    await writeFile(join(other,'README.md'),'agent update\n')
    git(other,'add','README.md');git(other,'commit','-m','agent conflicts')
    await writeFile(join(project,'README.md'),'human update\n')
    git(project,'add','README.md');git(project,'commit','-m','human conflicts')
    const mainHead=git(project,'rev-parse','HEAD')
    const conflict=await previewWorktreeIntegration(project,other,newBase)
    expect(conflict.canIntegrate).toBe(false)
    expect(conflict.reason).toContain('冲突')
    expect(git(project,'rev-parse','HEAD')).toBe(mainHead)
    expect(await readFile(join(project,'README.md'),'utf8')).toBe('human update\n')
    await expect(integrateWorktree(project,other,newBase,mainHead,git(other,'rev-parse','HEAD'),root))
      .rejects.toThrow('冲突')
    expect(git(project,'rev-parse','HEAD')).toBe(mainHead)
  }finally{await rm(root,{recursive:true,force:true})}
})

test('多智能体工作项独立模型和只读权限准确传递 SDK 会话启动选项',async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'desktop-agent-policy-'))
  const root=join(cwd,'private-store')
  const options:Array<Record<string,unknown>>=[]
  const fixtureData=fixture()
  const session=createDesktopGateway({
    ...fixtureData.options,cwd,missionRoot:root,
    createSession: (setting,resume)=>{
      options.push({...setting})
      return requiredValue(fixtureData.options.createSession,'SDK 会话工厂')(setting,resume)
    },
  })
  try{
    const mission=await session.handle(request('missions.create',{objective:'验证模型权限继承'})) as {id:string}
    const job=await session.handle(request('missions.jobs.enqueue',{
      missionId:mission.id,title:'定向规划',instruction:'只规划，不修改',
      model:'fixture-model',permissionMode:'plan',
    })) as {id:string}
    const started=await session.handle(request('missions.jobs.start',{
      missionId:mission.id,jobId:job.id,
    })) as {sessionId:string}
    expect(started.sessionId).toBeTruthy()
    expect(options[0]).toMatchObject({model:'fixture-model',permissionMode:'plan'})
  }finally{await session.close();await rm(cwd,{recursive:true,force:true})}
})

test('独立工作树合入 API 拒绝未审核工作项，不接受任意目录或提交',async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'desktop-integration-scope-'))
  const root=join(cwd,'store')
  const gateway=createDesktopGateway({...fixture().options,cwd,missionRoot:root})
  try {
    const mission=await gateway.handle(request('missions.create',{objective:'核查安全合入'})) as {id:string}
    const job=await gateway.handle(request('missions.jobs.enqueue',{
      missionId:mission.id,title:'未审核工作项',instruction:'不得合入',
    })) as {id:string}
    await expect(gateway.handle(request('missions.jobs.previewIntegrate',{
      missionId:mission.id,jobId:job.id,
    }))).rejects.toThrow('仅已审核完成')
    await expect(gateway.handle(request('missions.jobs.integrate',{
      missionId:mission.id,jobId:job.id,
      sourceHead:'a'.repeat(40),targetHead:'b'.repeat(40),
    }))).rejects.toThrow('仅已审核完成')
  }finally{await gateway.close();await rm(cwd,{recursive:true,force:true})}
})

test('独立工作树贯穿执行和恢复，目录消失时不能回退项目根目录',async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'desktop-job-worktree-'))
  const isolated=join(cwd,'isolated-job')
  await mkdir(isolated)
  const missionRoot=join(cwd,'mission-data')
  const data=fixture()
  const gateway=createDesktopGateway({
    ...data.options,cwd,missionRoot,
    prepareMissionJobWorkspace:async()=>({cwd:isolated,worktreePath:isolated,worktreeBranch:'test-isolated'}),
  })
  try{
    const mission=await gateway.handle(request('missions.create',{objective:'验证隔离和恢复'})) as {id:string}
    const job=await gateway.handle(request('missions.jobs.enqueue',{
      missionId:mission.id,title:'隔离开发',instruction:'仅在隔离工作树里修改代码',
    })) as {id:string}
    const run=await gateway.handle(request('missions.jobs.start',{
      missionId:mission.id,jobId:job.id,
    })) as {sessionId:string;job:{worktreePath:string}}
    expect(run.job.worktreePath).toBe(isolated)
    const tasks=await gateway.handle(request('missions.jobs.list',{missionId:mission.id})) as Array<{worktreePath:string}>
    expect(tasks[0]?.worktreePath).toBe(isolated)
    await gateway.handle(request('sessions.close',{sessionId:run.sessionId}))
    await rm(isolated,{recursive:true,force:true})
    await expect(gateway.handle(request('sessions.history',{sessionId:run.sessionId})))
      .rejects.toThrow('工作树已被删除')
    await expect(gateway.handle(request('sessions.ensureOpen',{sessionId:run.sessionId})))
      .rejects.toThrow('工作树已被删除')
  }finally{await gateway.close();await rm(cwd,{recursive:true,force:true})}
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
        missionId: mission.id, title: `工作${index}`, instruction: `逐项独立验证${index}`,
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
        missionId: mission.id, title: `第${i}项工作`, instruction: `核查项目单元${i}`,
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


test('多会话压力实测：32个独立SDK会话同时启动并完成流式工作，结果不能串到别的会话', async () => {
  const data = fixture()
  const gateway = createDesktopGateway(data.options)
  const completed = new Map<string, number>()
  const failures: string[] = []
  const stop = gateway.subscribe(event => {
    if (event.event === 'session.message' && event.message.type === 'result')
      completed.set(event.sessionId, (completed.get(event.sessionId) ?? 0) + 1)
    if (event.event === 'session.error') failures.push(`${event.sessionId}: ${event.error}`)
  })
  try {
    const count = 32
    const opened = await Promise.all(Array.from({ length: count }, () =>
      gateway.handle(request('sessions.open')) as Promise<{ sessionId: string }>))
    const ids = opened.map(item => item.sessionId)
    expect(new Set(ids).size).toBe(count)
    await Promise.all(ids.map((sessionId, index) => gateway.handle(
      request('sessions.send', { sessionId, message: `并行检查 ${index}` }),
    )))
    await until(() => ids.every(sessionId => completed.has(sessionId)))
    expect(failures).toEqual([])
    for (const id of ids) expect(completed.get(id)).toBe(1)
    const overview = await gateway.handle(request('agents.overview')) as { activeSessions: number }
    expect(overview.activeSessions).toBe(count)
  } finally {
    stop()
    await gateway.close()
  }
})

test('桌面历史默认尾页覆盖 0、260 和 400 条记录，旧版正序分页仍可用',async()=>{
  const root=await mkdtemp(join(tmpdir(),'desktop-history-tail-'))
  const data=fixture()
  let count=0
  const history={
    ...requiredValue(data.options.history,'会话历史服务'),
    async getSessionMessages(_id:string,options?:{limit?:number;offset?:number}) {
      const all=Array.from({length:count},(_,i)=>({
        type:'assistant',uuid:`history-${i}`,session_id:randomUUID(),
        message:{role:'assistant',content:[{type:'text',text:`item-${i}`}]},
      })) as unknown as SDKMessage[]
      return all.slice(options?.offset??0,options?.limit===undefined?undefined:(options.offset??0)+options.limit)
    },
  }
  const gateway=createDesktopGateway({...data.options,cwd:root,dataDir:join(root,'data'),history})
  try{
    for(const length of [0,260,400]){
      count=length
      const id=randomUUID()
      const page=await gateway.handle(request('sessions.history',{sessionId:id,tail:true,limit:200})) as {
        messages:SDKMessage[];total:number;offset:number
      }
      expect(page.total).toBe(length)
      expect(page.messages.length).toBe(Math.min(length,200))
      expect(page.offset).toBe(Math.max(0,length-200))
      if(length>0){
        expect(page.messages.at(-1)?.uuid).toBe(`history-${length-1}`)
      }
      const earlier=await gateway.handle(request('sessions.history',{
        sessionId:id,offset:0,limit:Math.max(1,page.offset),
      })) as SDKMessage[]
      expect(earlier.length).toBe(Math.max(0,Math.min(length,page.offset||1)))
    }
  }finally{await gateway.close();await rm(root,{recursive:true,force:true})}
})

test('会话独立模型和权限按工作区持久化，重启 SDK 恢复时重放真实选项',async()=>{
  const root=await mkdtemp(join(tmpdir(),'desktop-settings-restart-'))
  const data=fixture()
  const launches:Array<{model?:string;permissionMode?:string}>=[]
  const factory=requiredValue(data.options.createSession,'SDK 会话工厂')
  const options:DesktopGatewayOptions={
    ...data.options,cwd:root,dataDir:join(root,'data'),
    createSession:(settings,resume)=>{
      launches.push({model:settings.model,permissionMode:settings.permissionMode})
      return factory(settings,resume)
    },
  }
  let sessionId=''
  const first=createDesktopGateway(options)
  try{
    const opened=await first.handle(request('sessions.open',{model:'fixture-model'})) as {sessionId:string}
    sessionId=opened.sessionId
    await first.handle(request('sessions.setPermissionMode',{sessionId,mode:'plan'}))
    const live=await first.handle(request('sessions.status',{sessionId})) as {model:string;permissionMode:string}
    expect(live).toMatchObject({model:'fixture-model',permissionMode:'plan'})
  }finally{await first.close()}
  const resumed=createDesktopGateway(options)
  try{
    const reopened=await resumed.handle(request('sessions.ensureOpen',{sessionId})) as {model:string;permissionMode:string}
    expect(reopened).toMatchObject({model:'fixture-model',permissionMode:'plan'})
    expect(launches.at(-1)).toMatchObject({model:'fixture-model',permissionMode:'plan'})
  }finally{await resumed.close();await rm(root,{recursive:true,force:true})}
})

test('重启后不允许将旧版跳过审批状态带入未授权的桌面宿主',async()=>{
  const root=await mkdtemp(join(tmpdir(),'desktop-bypass-restore-'))
  const data=fixture()
  const opts={...data.options,cwd:root,dataDir:join(root,'data')}
  const first=createDesktopGateway({...opts,sessionOptions:{allowDangerouslySkipPermissions:true}})
  let id=''
  try {
    id=(await first.handle(request('sessions.open')) as {sessionId:string}).sessionId
    await first.handle(request('sessions.setPermissionMode',{sessionId:id,mode:'bypassPermissions'}))
  }finally{await first.close()}
  const disallowed=createDesktopGateway(opts)
  try {
    await expect(disallowed.handle(request('sessions.ensureOpen',{sessionId:id})))
      .rejects.toThrow('explicit host permission')
  }finally{await disallowed.close();await rm(root,{recursive:true,force:true})}
})

test('两个同时恢复相同会话的请求共享一次 SDK 启动且返回同一配置',async()=>{
  const root=await mkdtemp(join(tmpdir(),'desktop-ensure-once-'))
  const original=fixture()
  let launches=0
  const sessionFactory=requiredValue(original.options.createSession,'SDK 会话工厂')
  const options:DesktopGatewayOptions={
    ...original.options,cwd:root,dataDir:join(root,'data'),
    createSession:(settings,id)=>{launches++;return sessionFactory(settings,id)},
  }
  const gateway=createDesktopGateway(options)
  try {
    const opened=await gateway.handle(request('sessions.open')) as {sessionId:string}
    await gateway.handle(request('sessions.close',{sessionId:opened.sessionId}))
    const before=launches
    const first=gateway.handle(request('sessions.ensureOpen',{sessionId:opened.sessionId}))
    const second=gateway.handle(request('sessions.ensureOpen',{sessionId:opened.sessionId}))
    const [a,b]=await Promise.all([first,second]) as Array<{sessionId:string;model:string|null;permissionMode:string|null}>
    expect(a.sessionId).toBe(opened.sessionId)
    expect(b).toEqual(a)
    expect(launches-before).toBe(1)
  } finally {await gateway.close();await rm(root,{recursive:true,force:true})}
})
