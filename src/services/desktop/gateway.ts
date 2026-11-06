import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { AgentInfoSchema, ModelInfoSchema } from '../../entrypoints/sdk/coreSchemas.js'
import { getSessionInfo, getSessionMessages, listSessions } from '../../entrypoints/agentSdkTypes.js'
import type { InternalOptions, SDKSessionOptions } from '../../entrypoints/sdk/runtimeTypes.js'
import { createHeadlessConversationSession } from '../conversation/headlessSession.js'
import { createDesktopTaskJournal, type DesktopTaskJournal } from './taskJournal.js'
import { isAgentProgress, projectTask, type DesktopTask } from './taskProjection.js'
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
  unsubscribe: Array<() => void>
  consuming?: Promise<void>
}
export type DesktopGatewayOptions = {
  cwd?: string
  model?: string
  sessionOptions?: Omit<InternalOptions, 'canUseTool' | 'resume' | 'continue' | 'cwd' | 'model'>
  dataDir?: string
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
  const history = options.history ?? { listSessions, getSessionInfo, getSessionMessages }
  const journal = options.journal ?? createDesktopTaskJournal(cwd, options.dataDir)
  const sessions = new Map<string, Entry>()
  const opening = new Set<string>()
  const listeners = new Set<(event: DesktopEvent) => void>()
  let closed = false

  function emit(event: DesktopEvent): void {
    for (const listener of listeners) listener(event)
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
      emit({ event: 'session.state', sessionId: id, state: runtime.state.getState() })
      return { sessionId: id, resumed: !!resume, ...info, tasks }
    } catch (error) {
      if (runtime) await runtime.closeAndWait()
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

  async function send(sessionId: string, message: Parameters<Headless['send']>[0]) {
    const entry = requireSession(sessionId)
    if (entry.consuming) throw new Error('A turn is already being consumed')
    await entry.runtime.send(message)
    const turnId = randomUUID()
    const pump = async () => {
      try {
        for await (const sdkMessage of entry.runtime.stream()) {
          emit({ event: 'session.message', sessionId, turnId, message: sdkMessage })
          if (isAgentProgress(sdkMessage)) {
            const oldTask = sdkMessage.type === 'system' && 'task_id' in sdkMessage
              ? entry.tasks.get(sdkMessage.task_id) : undefined
            const task = projectTask(sdkMessage, oldTask)
            if (task) {
              entry.tasks.set(task.taskId, task)
              await journal.write(sessionId, [...entry.tasks.values()])
              emit({ event: 'task.updated', sessionId, task })
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
        entry.consuming = undefined
      }
    }
    entry.consuming = pump()
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
    const entry = requireSession(sessionId)
    try {
      await entry.runtime.closeAndWait()
      if (entry.consuming) await entry.consuming
    } finally {
      for (const stop of entry.unsubscribe) stop()
      sessions.delete(sessionId)
    }
    const stale = [...entry.tasks.values()].map(task =>
      task.status === 'running' ? { ...task, status: 'interrupted' as const } : task)
    if (stale.length) await journal.write(sessionId, stale)
    return { sessionId, closed: true }
  }

  async function handle(request: DesktopRequest): Promise<unknown> {
    if (closed) throw new Error('Desktop gateway is closed')
    switch (request.method) {
      case 'hello':
        return {
          protocolVersion: DESKTOP_PROTOCOL_VERSION,
          transport: 'stdio-jsonl',
          stream: 'sdk-stream-json',
          capabilities: ['models', 'sessions', 'interrupt', 'permissions', 'agent_progress', 'task_recovery'],
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
      case 'permissions.list': return requireSession(request.sessionId).runtime.permissions.getPending()
      case 'permissions.decide': {
        const broker = requireSession(request.sessionId).runtime.permissions
        if (!broker.settle(request.permissionId, request.decision)) throw new Error('Permission request expired or belongs to another session')
        return { permissionId: request.permissionId, accepted: true }
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
    try {
      await entry.runtime.closeAndWait()
      if (entry.consuming) await entry.consuming
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
