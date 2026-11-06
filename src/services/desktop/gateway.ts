import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { getActiveAgentMode, setAgentMode } from '../../utils/agentMode.js'
import {
  createMission, getMission, getSelectedMissionId, listMissions,
  saveMissionCheckpoint, selectMission, updateMissionStatus,
  linkMissionAssignment, finishMissionAssignment,
} from '../../utils/agentMissions.js'
import { listProjectTeams } from '../../utils/teamDiscovery.js'
import {
  missionJobAssignmentId, listMissionJobs, enqueueMissionJob, claimMissionJob,
  bindMissionJobTurn, settleMissionJob, approveMissionJob, retryMissionJob,
  cancelMissionJob, recoverMissionJob, type MissionJob,
} from '../agentCenter/missionJobs.js'
import { AgentInfoSchema, ModelInfoSchema } from '../../entrypoints/sdk/coreSchemas.js'
import type { getSessionInfo, getSessionMessages, listSessions } from '../../entrypoints/agentSdkTypes.js'
import type { InternalOptions, SDKSessionOptions } from '../../entrypoints/sdk/runtimeTypes.js'
import { createHeadlessConversationSession } from '../conversation/headlessSession.js'
import { createDesktopTaskJournal, type DesktopTaskJournal } from './taskJournal.js'
import { isAgentProgress, projectBackgroundTasks, projectTask, type DesktopTask } from './taskProjection.js'
import { DESKTOP_PROTOCOL_VERSION, type DesktopEvent, type DesktopRequest } from './protocol.js'
import { z } from 'zod/v4'

type Headless = ReturnType<typeof createHeadlessConversationSession>
type SessionFactory = (options: SDKSessionOptions | InternalOptions, resume?: string) => Headless
type HistoryService = {
  listSessions: typeof listSessions
  getSessionInfo: typeof getSessionInfo
  getSessionMessages: typeof getSessionMessages
}
type Entry = {
  runtime: Headless
  tasks: Map<string, DesktopTask>
  seenPermissions: Set<string>
  seenHostRequests: Set<string>
  unsubscribe: Array<() => void>
  consuming?: Promise<void>
  persisting?: Promise<void>
  sending?: Promise<void>
  cancelSend?: (error: Error) => void
  closing?: boolean
}
export type DesktopGatewayOptions = {
  cwd?: string
  model?: string
  sessionOptions?: Omit<InternalOptions, 'canUseTool' | 'resume' | 'continue' | 'cwd' | 'model'>
  dataDir?: string
  /** Optional task-diary root for isolated local hosts and tests. */
  missionRoot?: string
  journal?: DesktopTaskJournal
  createSession?: SessionFactory
  history?: HistoryService
}
const modelListSchema = z.array(ModelInfoSchema())
const agentListSchema = z.array(AgentInfoSchema())

/** The SDK child owns the model loop and control protocol; the gateway only
 * translates local desktop requests into SDK control and stream-json events. */
export function createDesktopGateway(options: DesktopGatewayOptions = {}) {
  const cwd = resolve(options.cwd ?? process.cwd())
  const model = options.model
  const launch = options.createSession ?? createHeadlessConversationSession
  // Only load the full Agent SDK history entrypoint when actually needed.
  // Desktop sessions with injected or cached history stay renderer-neutral and
  // do not initialize unrelated SDK modules merely by importing the gateway.
  const history: HistoryService = options.history ?? {
    async listSessions(...args: Parameters<typeof listSessions>) {
      return (await import('../../entrypoints/agentSdkTypes.js')).listSessions(...args)
    },
    async getSessionInfo(...args: Parameters<typeof getSessionInfo>) {
      return (await import('../../entrypoints/agentSdkTypes.js')).getSessionInfo(...args)
    },
    async getSessionMessages(...args: Parameters<typeof getSessionMessages>) {
      return (await import('../../entrypoints/agentSdkTypes.js')).getSessionMessages(...args)
    },
  }
  const journal = options.journal ?? createDesktopTaskJournal(cwd, options.dataDir)
  const sessions = new Map<string, Entry>()
  const opening = new Set<string>()
  const ownerKey = randomUUID()
  const executingMissionJobs = new Map<string, { missionId: string; jobId: string; runId: string }>()
  const listeners = new Set<(event: DesktopEvent) => void>()
  let closed = false

  function emit(event: DesktopEvent): void {
    for (const listener of listeners) listener(event)
  }
  // State persistence runs in order but never blocks SDK event delivery. A
  // failed snapshot is visible to the host and the next complete snapshot
  // can repair it without poisoning subsequent writes.
  function scheduleTaskSnapshot(sessionId: string, entry: Entry): void {
    const snapshot = [...entry.tasks.values()]
    entry.persisting = (entry.persisting ?? Promise.resolve())
      .then(() => journal.write(sessionId, snapshot))
      .catch(error => emit({
        event: 'task.persistence.error', sessionId,
        error: error instanceof Error ? error.message : String(error),
      }))
  }
  function subscribe(listener: (event: DesktopEvent) => void): () => void {
    if (closed) throw new Error('Desktop gateway is closed')
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  function requireSession(sessionId: string): Entry {
    const entry = sessions.get(sessionId)
    if (!entry) throw new Error(`Desktop session is not open: ${sessionId}`)
    return entry
  }
  function sdkOptions(selectedModel?: string): InternalOptions {
    return {
      ...options.sessionOptions,
      cwd,
      ...(selectedModel || model ? { model: selectedModel ?? model } : {}),
      includePartialMessages: true,
      forwardSubagentText: true,
    }
  }
  function initializeModels(runtime: Headless) {
    return runtime.initialization.then(info => ({
      models: modelListSchema.parse(info.models),
      agents: agentListSchema.parse(info.agents),
    }))
  }

  async function openSession(selectedModel?: string, resume?: string) {
    if (closed) throw new Error('Desktop gateway is closed')
    if (resume) {
      if (sessions.has(resume) || opening.has(resume)) throw new Error(`Session is already open: ${resume}`)
      opening.add(resume)
    }
    let runtime: Headless | undefined
    try {
      // A resume ID must be tied to a real transcript in this workspace.
      if (resume) {
        const known = options.sessionOptions?.sessionStore
          ? (await options.sessionOptions.sessionStore.listSessions(
              (await import('../../utils/sessionStoragePortable.js')).sanitizePath(
                await (await import('../../utils/sessionStoragePortable.js')).canonicalizePath(cwd),
              ),
            )).some(entry => entry.sessionId === resume)
          : !!await history.getSessionInfo(resume, { dir: cwd })
        if (!known) throw new Error(`No stored session in this workspace: ${resume}`)
      }
      const tasks = resume ? await journal.read(resume) : []
      runtime = launch(sdkOptions(selectedModel), resume)
      const info = await initializeModels(runtime)
      if (closed) throw new Error('Desktop gateway closed during session initialization')
      const id = runtime.sessionId
      if (sessions.has(id)) throw new Error(`Desktop session already open: ${id}`)
      const activeRuntime = runtime
      const entry: Entry = {
        runtime: activeRuntime,
        tasks: new Map(tasks.map(task => [task.taskId, task])),
        seenPermissions: new Set(),
        seenHostRequests: new Set(),
        unsubscribe: [],
      }
      sessions.set(id, entry)
      entry.unsubscribe.push(activeRuntime.state.subscribe(() => emit({
        event: 'session.state', sessionId: id, state: activeRuntime.state.getState(),
      })))
      entry.unsubscribe.push(activeRuntime.permissions.subscribe(() => {
        const pending = activeRuntime.permissions.getPending()
        const current = new Set(pending.map(item => item.id))
        for (const item of pending) if (!entry.seenPermissions.has(item.id)) {
          emit({ event: 'permission.request', sessionId: id, permission: item })
        }
        for (const prior of entry.seenPermissions) if (!current.has(prior)) {
          emit({ event: 'permission.resolved', sessionId: id, permissionId: prior })
        }
        entry.seenPermissions = current
      }))
      entry.unsubscribe.push(activeRuntime.hostControls.subscribe(() => {
        const pending = activeRuntime.hostControls.getPending()
        const current = new Set(pending.map(item => item.id))
        for (const item of pending) if (!entry.seenHostRequests.has(item.id)) {
          emit({ event: 'host.request', sessionId: id, request: item })
        }
        for (const prior of entry.seenHostRequests) if (!current.has(prior)) {
          emit({ event: 'host.resolved', sessionId: id, requestId: prior })
        }
        entry.seenHostRequests = current
      }))
      emit({ event: 'session.state', sessionId: id, state: runtime.state.getState() })
      return { sessionId: id, resumed: !!resume, ...info, tasks }
    } catch (error) {
      if (runtime) {
        const active = sessions.get(runtime.sessionId)
        if (active?.runtime === runtime) {
          for (const stop of active.unsubscribe) stop()
          sessions.delete(runtime.sessionId)
        }
        await runtime.closeAndWait()
      }
      throw error
    } finally {
      if (resume) opening.delete(resume)
    }
  }

  async function models(sessionId?: string) {
    if (sessionId) return initializeModels(requireSession(sessionId).runtime)
    const probe = launch(sdkOptions())
    try { return await initializeModels(probe) }
    finally { await probe.closeAndWait() }
  }

  function notifyJob(missionId: string, job: MissionJob): void {
    emit({ event: 'mission.job.updated', missionId, job })
  }
  async function settleExecutingJob(
    sessionId: string, status: 'review' | 'failed' | 'interrupted', summary: string,
  ): Promise<void> {
    const active = executingMissionJobs.get(sessionId)
    if (!active) return
    const job = await settleMissionJob(
      active.missionId, cwd, active.jobId, active.runId, status,
      summary.slice(0, 4000), options.missionRoot,
    )
    executingMissionJobs.delete(sessionId)
    notifyJob(active.missionId, job)
  }

  async function send(sessionId: string, message: Parameters<Headless['send']>[0]) {
    const entry = requireSession(sessionId)
    if (entry.closing || entry.consuming || entry.sending)
      throw new Error('A turn is already being consumed or the session is closing')
    // Reserve the session before the first await: concurrent desktop callers
    // must never enqueue two turns into a single SDK stream simultaneously.
    let finishSend!: () => void
    entry.sending = new Promise<void>(resolve => { finishSend = resolve })
    // Closing the host must not wait for a stuck SDK send/transport promise.
    // Keep the SDK send observed by Promise.race and close the underlying
    // runtime independently; a late send result cannot resurrect the turn.
    const cancelled = new Promise<never>((_, reject) => { entry.cancelSend = reject })
    const turnId = randomUUID()
    try {
      await Promise.race([entry.runtime.send(message), cancelled])
      if (entry.closing || closed) throw new Error('Desktop session closed during send')
    } catch (error) {
      entry.cancelSend = undefined
      entry.sending = undefined
      finishSend()
      throw error
    }
    const pump = async () => {
      try {
        for await (const sdkMessage of entry.runtime.stream()) {
          emit({ event: 'session.message', sessionId, turnId, message: sdkMessage })
          if (sdkMessage.type === 'result' && executingMissionJobs.has(sessionId)) {
            const success = !sdkMessage.is_error && sdkMessage.subtype === 'success'
            const summary = typeof sdkMessage.result === 'string' && sdkMessage.result.trim()
              ? sdkMessage.result : success ? '模型执行已结束，等待人工核查' : '模型执行返回失败'
            await settleExecutingJob(sessionId, success ? 'review' : 'failed', summary)
          }
          if (isAgentProgress(sdkMessage)) {
            const background = projectBackgroundTasks(sdkMessage, entry.tasks)
            for (const task of background) {
              entry.tasks.set(task.taskId, task)
              emit({ event: 'task.updated', sessionId, task })
            }
            if (background.length) scheduleTaskSnapshot(sessionId, entry)
            const oldTask = sdkMessage.type === 'system' && 'task_id' in sdkMessage
              ? entry.tasks.get(sdkMessage.task_id) : undefined
            const task = projectTask(sdkMessage, oldTask)
            if (task) {
              entry.tasks.set(task.taskId, task)
              emit({ event: 'task.updated', sessionId, task })
              scheduleTaskSnapshot(sessionId, entry)
            }
            emit({ event: 'agent.progress', sessionId, turnId, message: sdkMessage, ...(task && { task }) })
          }
        }
      } catch (error) {
        emit({
          event: 'session.error', sessionId, turnId,
          error: error instanceof Error ? error.message : String(error),
        })
      } finally {
        if (executingMissionJobs.has(sessionId)) {
          try {
            await settleExecutingJob(sessionId, 'interrupted', '执行流结束前未取得完整结果；请核对实际改动后手动重试')
          } catch (error) {
            emit({ event: 'session.error', sessionId, turnId,
              error: '长期任务恢复记录失败：' + String(error) })
          }
        }
        entry.consuming = undefined
      }
    }
    entry.consuming = pump()
    entry.cancelSend = undefined
    entry.sending = undefined
    finishSend()
    return { sessionId, turnId }
  }

  async function restoreTask(sessionId: string, taskId: string, prompt?: string) {
    const existing = sessions.get(sessionId)
    const tasks = existing ? [...existing.tasks.values()] : await journal.read(sessionId)
    const task = tasks.find(item => item.taskId === taskId)
    if (!task) throw new Error(`Task is not in the stored session: ${taskId}`)
    if (task.status === 'completed') throw new Error('Completed tasks do not require recovery')
    if (task.status === 'running') throw new Error('Task is already running')
    const restored = existing ? undefined : await openSession(undefined, sessionId)
    // Restore the original SDK transcript before accepting explicit new work.
    const turn = prompt ? await send(sessionId, `Continue task ${taskId} (${task.description}). ${prompt}`) : undefined
    return { sessionId, task, restored: !!restored, action: turn ? 'continued' : 'context_restored', ...(turn && { turnId: turn.turnId }) }
  }

  async function closeSession(sessionId: string) {
    requireSession(sessionId)
    await closeSessionInternal(sessionId)
    return { sessionId, closed: true }
  }

  async function getScopedMission(missionId: string) {
    const mission = await getMission(missionId, options.missionRoot)
    if (resolve(mission.projectDir) !== cwd)
      throw new Error('This mission belongs to a different workspace')
    return mission
  }
  async function projectMissions() {
    return (await listMissions(options.missionRoot))
      .filter(mission => resolve(mission.projectDir) === cwd)
  }

  async function handle(request: DesktopRequest): Promise<unknown> {
    if (closed) throw new Error('Desktop gateway is closed')
    switch (request.method) {
      case 'hello':
        return {
          protocolVersion: DESKTOP_PROTOCOL_VERSION,
          transport: 'stdio-jsonl',
          stream: 'sdk-stream-json',
          capabilities: ['models', 'sessions', 'interrupt', 'permissions', 'agent_progress', 'task_recovery', 'agents', 'missions', 'mission_jobs'],
        }
      case 'models.list': return models(request.sessionId)
      case 'sessions.open': return openSession(request.model)
      case 'sessions.resume': return openSession(undefined, request.sessionId)
      case 'sessions.list': return history.listSessions({ dir: cwd, limit: request.limit, offset: request.offset })
      case 'sessions.history': return history.getSessionMessages(request.sessionId, {
        dir: cwd, limit: request.limit, offset: request.offset, includeSystemMessages: true,
      })
      case 'sessions.close': return closeSession(request.sessionId)
      case 'sessions.status': return requireSession(request.sessionId).runtime.state.getState()
      case 'sessions.send': return send(request.sessionId, request.message)
      case 'sessions.interrupt': {
        const entry = requireSession(request.sessionId)
        entry.runtime.permissions.cancelPending('Interrupted by desktop user')
        entry.runtime.hostControls.cancelPending('Interrupted by desktop user')
        await entry.runtime.interrupt()
        return { sessionId: request.sessionId, requested: true }
      }
      case 'sessions.setModel': {
        const entry = requireSession(request.sessionId)
        await entry.runtime.control({ subtype: 'set_model', model: request.model })
        return { model: request.model }
      }
      case 'sessions.setPermissionMode': {
        if (request.mode === 'bypassPermissions' && !options.sessionOptions?.allowDangerouslySkipPermissions) {
          throw new Error('Bypass permissions requires explicit host configuration')
        }
        await requireSession(request.sessionId).runtime.control({ subtype: 'set_permission_mode', mode: request.mode })
        return { mode: request.mode }
      }
      case 'host.list': return requireSession(request.sessionId).runtime.hostControls.getPending()
      case 'host.respond': {
        const host = requireSession(request.sessionId).runtime.hostControls
        if (!host.settle(request.requestId, request.response)) throw new Error('Host request expired or belongs to another session')
        return { requestId: request.requestId, accepted: true }
      }
      case 'host.reject': {
        const host = requireSession(request.sessionId).runtime.hostControls
        if (!host.reject(request.requestId, request.reason)) throw new Error('Host request expired or belongs to another session')
        return { requestId: request.requestId, accepted: true }
      }
      case 'permissions.list': return requireSession(request.sessionId).runtime.permissions.getPending()
      case 'permissions.decide': {
        const broker = requireSession(request.sessionId).runtime.permissions
        if (!broker.settle(request.permissionId, request.decision)) throw new Error('Permission request expired or belongs to another session')
        return { permissionId: request.permissionId, accepted: true }
      }
      case 'agents.overview': {
        const [missions, teams] = await Promise.all([projectMissions(), listProjectTeams(cwd)])
        return {
          mode: getActiveAgentMode(),
          selectedMissionId: getSelectedMissionId(cwd) ?? null,
          missions,
          teams,
          activeSessions: sessions.size,
          activeTasks: [...sessions.values()]
            .flatMap(session => [...session.tasks.values()])
            .filter(task => task.status === 'running').length,
        }
      }
      case 'agents.setMode':
        setAgentMode(request.mode)
        return { mode: getActiveAgentMode() }
      case 'missions.list':
        return { selectedMissionId: getSelectedMissionId(cwd) ?? null, missions: await projectMissions() }
      case 'missions.get': return getScopedMission(request.missionId)
      case 'missions.create': {
        const mission = await createMission(request.objective, cwd, options.missionRoot)
        selectMission(mission.id, cwd)
        setAgentMode('super')
        return mission
      }
      case 'missions.select': {
        if (request.missionId !== null) await getScopedMission(request.missionId)
        selectMission(request.missionId ?? undefined, cwd)
        return { selectedMissionId: request.missionId }
      }
      case 'missions.updateStatus': {
        await getScopedMission(request.missionId)
        return updateMissionStatus(request.missionId, request.status, options.missionRoot)
      }
      case 'missions.checkpoint': {
        await getScopedMission(request.missionId)
        return saveMissionCheckpoint(request.missionId, request.checkpoint, options.missionRoot)
      }
      case 'missions.jobs.list': {
        await getScopedMission(request.missionId)
        return listMissionJobs(request.missionId, cwd, options.missionRoot)
      }
      case 'missions.jobs.enqueue': {
        const mission = await getScopedMission(request.missionId)
        if (mission.status !== 'active') throw new Error('当前长期任务已暂停或完成')
        const job = await enqueueMissionJob(
          mission.id, cwd, request.title, request.instruction, options.missionRoot,
        )
        try {
          await linkMissionAssignment(
            mission.id, missionJobAssignmentId(job.id), 'agent', job.title, options.missionRoot,
          )
        } catch (error) {
          // The queued job has not started. Cancel it if linking the mission's
          // completion gate fails so no unauthorized orphan can be dispatched.
          const cancelled = await cancelMissionJob(mission.id, cwd, job.id, options.missionRoot)
          notifyJob(mission.id, cancelled)
          throw error
        }
        notifyJob(mission.id, job)
        return job
      }
      case 'missions.jobs.start': {
        const mission = await getScopedMission(request.missionId)
        if (mission.status !== 'active') throw new Error('当前长期任务已暂停或完成')
        const claimed = await claimMissionJob(
          mission.id, cwd, request.jobId, ownerKey, process.pid, options.missionRoot,
        )
        notifyJob(mission.id, claimed)
        let openedSession: string | undefined
        try {
          // Each user-requested dispatch gets its own native SDK session.
          // Worker/tool permissions are still checked by the SDK broker.
          setAgentMode('super')
          const opened = await openSession()
          openedSession = opened.sessionId
          await bindMissionJobTurn(
            mission.id, cwd, claimed.id, claimed.runId!, openedSession,
            undefined, options.missionRoot,
          )
          executingMissionJobs.set(openedSession, {
            missionId: mission.id, jobId: claimed.id, runId: claimed.runId!,
          })
          const instruction = [
            '执行已授权的超级智能体工作项；保持项目目录与工具审批边界。',
            '长期任务：' + mission.id + '。目标：' + mission.objective,
            '工作项：' + claimed.title + '。执行尝试：' + claimed.attempt,
            claimed.instruction,
            '执行前核对已有文件和提交，禁止重复已产生的外部副作用。',
            '交付时报告实际文件/提交、测试证据及仍需人工审核的事项。',
          ].join('\\n')
          const started = await send(openedSession, instruction)
          const updated = await bindMissionJobTurn(
            mission.id, cwd, claimed.id, claimed.runId!, openedSession,
            started.turnId, options.missionRoot,
          )
          notifyJob(mission.id, updated)
          return { sessionId: openedSession, turnId: started.turnId, job: updated }
        } catch (error) {
          executingMissionJobs.delete(openedSession ?? '')
          const job = await settleMissionJob(
            mission.id, cwd, claimed.id, claimed.runId!, 'failed',
            '启动执行失败：' + String(error), options.missionRoot,
          )
          notifyJob(mission.id, job)
          if (openedSession && sessions.has(openedSession)) await closeSessionInternal(openedSession)
          throw error
        }
      }
      case 'missions.jobs.approve': {
        const mission = await getScopedMission(request.missionId)
        const job = await approveMissionJob(mission.id, cwd, request.jobId, options.missionRoot)
        await finishMissionAssignment(
          mission.id, missionJobAssignmentId(job.id), 'completed', options.missionRoot,
        )
        notifyJob(mission.id, job)
        return job
      }
      case 'missions.jobs.retry': {
        const mission = await getScopedMission(request.missionId)
        if (mission.status !== 'active') throw new Error('请先恢复长期任务后再重试')
        const job = await retryMissionJob(mission.id, cwd, request.jobId, options.missionRoot)
        notifyJob(mission.id, job)
        return job
      }
      case 'missions.jobs.recover': {
        const mission = await getScopedMission(request.missionId)
        const job = await recoverMissionJob(mission.id, cwd, request.jobId, options.missionRoot)
        notifyJob(mission.id, job)
        return job
      }
      case 'missions.jobs.cancel': {
        const mission = await getScopedMission(request.missionId)
        const job = await cancelMissionJob(mission.id, cwd, request.jobId, options.missionRoot)
        await finishMissionAssignment(
          mission.id, missionJobAssignmentId(job.id), 'killed', options.missionRoot,
        )
        notifyJob(mission.id, job)
        return job
      }
      case 'tasks.list': {
        const active = sessions.get(request.sessionId)
        return active ? [...active.tasks.values()] : journal.read(request.sessionId)
      }
      case 'tasks.stop': {
        await requireSession(request.sessionId).runtime.control({ subtype: 'stop_task', task_id: request.taskId })
        return { taskId: request.taskId, requested: true }
      }
      case 'tasks.resume': return restoreTask(request.sessionId, request.taskId, request.prompt)
    }
  }

  async function close(): Promise<void> {
    if (closed) return
    closed = true
    const ids = [...sessions.keys()]
    const results = await Promise.allSettled(ids.map(id => closeSessionInternal(id)))
    listeners.clear()
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Desktop gateway shutdown failed')
  }
  async function closeSessionInternal(id: string) {
    const entry = sessions.get(id)
    if (!entry) return
    if (entry.closing) throw new Error(`Desktop session is already closing: ${id}`)
    entry.closing = true
    entry.cancelSend?.(new Error('Desktop session closed during send'))
    try {
      // Closing a stream-json child can require its in-flight send/stream to
      // settle. Join these lifecycles concurrently; awaiting child shutdown
      // first can deadlock the desktop IPC close request.
      const closing = entry.runtime.closeAndWait()
      const pending = [closing]
      if (entry.sending) pending.push(entry.sending)
      if (entry.consuming) pending.push(entry.consuming)
      await Promise.all(pending)
      if (executingMissionJobs.has(id)) {
        await settleExecutingJob(id, 'interrupted', '桌面执行宿主关闭；请核查结果后显式重试')
      }
      if (entry.persisting) await entry.persisting
      const stale = [...entry.tasks.values()].map(task => task.status === 'running'
        ? { ...task, status: 'interrupted' as const } : task)
      if (stale.length) await journal.write(id, stale)
    } finally {
      for (const stop of entry.unsubscribe) stop()
      sessions.delete(id)
    }
  }
  return { handle, subscribe, close }
}
