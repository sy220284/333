import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import type { SDKUserMessage, SDKSessionInfo } from '../../entrypoints/sdk/coreTypes.js'
import type { PendingSdkPermission } from '../conversation/permissionBroker.js'
import type { PendingHostControl } from '../conversation/hostControlBroker.js'
import type { DesktopTask } from './taskProjection.js'
import type { AgentMission, AgentMissionStatus } from '../../utils/agentMissions.js'
import type { AgentMode } from '../../utils/agentMode.js'
import type { TeamSummary } from '../../utils/teamDiscovery.js'
import { DesktopRequestSchema, type DesktopEvent, type DesktopReply, type DesktopRequest } from './protocol.js'

type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void }
type ClientCall = DesktopRequest extends infer R
  ? R extends { id: string } ? Omit<R, 'id'> : never
  : never

/** Electron main-process adapter over a trusted desktopHost child stdio.
 * Multiple requests and unsolicited SDK events share one connection.
 * Every request settles once, including on disconnect and parse failures. */
export function createDesktopClient(input: Readable, output: Writable) {
  const reader = createInterface({ input, crlfDelay: Infinity, terminal: false })
  const pending = new Map<string, Pending>()
  const listeners = new Set<(event: DesktopEvent) => void>()
  let closed = false
  let writer = Promise.resolve()

  function failAll(error: Error): void {
    if (closed) return
    closed = true
    reader.close()
    for (const callback of pending.values()) callback.reject(error)
    pending.clear()
    listeners.clear()
  }
  reader.on('close', () => failAll(new Error('Desktop host disconnected')))
  input.on('error', error => failAll(error))
  output.on('error', error => failAll(error))
  reader.on('line', line => {
    if (closed || !line.trim()) return
    let raw: unknown
    try { raw = JSON.parse(line) }
    catch (error) {
      failAll(new Error(`Invalid desktop host JSON: ${error instanceof Error ? error.message : String(error)}`))
      return
    }
    if (!raw || typeof raw !== 'object') {
      failAll(new Error('Invalid desktop host frame'))
      return
    }
    if ('event' in raw) {
      if (typeof raw.event !== 'string') {
        failAll(new Error('Invalid desktop host event'))
        return
      }
      for (const listener of listeners) listener(raw as DesktopEvent)
      return
    }
    const reply = raw as DesktopReply
    if (typeof reply.id !== 'string' || typeof reply.ok !== 'boolean') {
      failAll(new Error('Invalid desktop host reply'))
      return
    }
    const callback = pending.get(reply.id)
    if (!callback) return
    pending.delete(reply.id)
    if (reply.ok === true) callback.resolve(reply.result)
    else callback.reject(new Error(`${reply.error.code}: ${reply.error.message}`))
  })

  function invoke<R = unknown>(call: ClientCall): Promise<R> {
    if (closed) return Promise.reject(new Error('Desktop host connection is closed'))
    const id = randomUUID()
    const frame = DesktopRequestSchema.parse({ ...call, id })
    return new Promise<R>((resolve, reject) => {
      pending.set(id, {
        resolve: value => resolve(value as R),
        reject,
      })
      const write = writer.then(() => new Promise<void>((accept, fail) => {
        output.write(`${JSON.stringify(frame)}\n`, error => error ? fail(error) : accept())
      }))
      writer = write.catch(error => failAll(error instanceof Error ? error : new Error(String(error))))
    })
  }
  function onEvent(listener: (event: DesktopEvent) => void) {
    if (closed) throw new Error('Desktop host connection is closed')
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  return {
    invoke,
    onEvent,
    hello: () => invoke<{ protocolVersion: number; capabilities: string[] }>({ method: 'hello' }),
    listModels: (sessionId?: string) => invoke<{ models: Array<{ value: string; displayName: string; description: string }>; agents: Array<{ name: string; description: string }> }>({ method: 'models.list', ...(sessionId && { sessionId }) }),
    openSession: (model?: string) => invoke<{ sessionId: string; resumed: boolean; tasks: DesktopTask[] }>({ method: 'sessions.open', ...(model && { model }) }),
    resumeSession: (sessionId: string) => invoke<{ sessionId: string; resumed: boolean; tasks: DesktopTask[] }>({ method: 'sessions.resume', sessionId }),
    listSessions: (limit?: number, offset?: number) => invoke<SDKSessionInfo[]>({ method: 'sessions.list', limit, offset }),
    history: (sessionId: string, limit?: number, offset?: number) => invoke({ method: 'sessions.history', sessionId, limit, offset }),
    send: (sessionId: string, message: string | SDKUserMessage) => invoke<{ sessionId: string; turnId: string }>({ method: 'sessions.send', sessionId, message }),
    interrupt: (sessionId: string) => invoke<{ requested: boolean }>({ method: 'sessions.interrupt', sessionId }),
    setModel: (sessionId: string, model: string) => invoke({ method: 'sessions.setModel', sessionId, model }),
    setPermissionMode: (sessionId: string, mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk') => invoke({ method: 'sessions.setPermissionMode', sessionId, mode }),
    listHostRequests: (sessionId: string) => invoke<PendingHostControl[]>({ method: 'host.list', sessionId }),
    respondToHost: (sessionId: string, requestId: string, response: Record<string, unknown>) =>
      invoke({ method: 'host.respond', sessionId, requestId, response }),
    rejectHostRequest: (sessionId: string, requestId: string, reason: string) =>
      invoke({ method: 'host.reject', sessionId, requestId, reason }),
    listPermissions: (sessionId: string) => invoke<PendingSdkPermission[]>({ method: 'permissions.list', sessionId }),
    decidePermission: (sessionId: string, permissionId: string, decision: Extract<DesktopRequest, { method: 'permissions.decide' }>['decision']) =>
      invoke({ method: 'permissions.decide', sessionId, permissionId, decision }),
    agentOverview: () => invoke<{
      mode: AgentMode; selectedMissionId: string | null;
      missions: AgentMission[]; teams: TeamSummary[];
      activeSessions: number; activeTasks: number;
    }>({ method: 'agents.overview' }),
    setAgentMode: (mode: AgentMode) =>
      invoke<{ mode: AgentMode }>({ method: 'agents.setMode', mode }),
    listMissions: () => invoke<{ selectedMissionId: string | null; missions: AgentMission[] }>({ method: 'missions.list' }),
    getMission: (missionId: string) => invoke<AgentMission>({ method: 'missions.get', missionId }),
    createMission: (objective: string) => invoke<AgentMission>({ method: 'missions.create', objective }),
    selectMission: (missionId: string | null) =>
      invoke<{ selectedMissionId: string | null }>({ method: 'missions.select', missionId }),
    updateMissionStatus: (missionId: string, status: AgentMissionStatus) =>
      invoke<AgentMission>({ method: 'missions.updateStatus', missionId, status }),
    saveMissionCheckpoint: (missionId: string, checkpoint: string) =>
      invoke<AgentMission>({ method: 'missions.checkpoint', missionId, checkpoint }),
    listTasks: (sessionId: string) => invoke<DesktopTask[]>({ method: 'tasks.list', sessionId }),
    stopTask: (sessionId: string, taskId: string) => invoke({ method: 'tasks.stop', sessionId, taskId }),
    resumeTask: (sessionId: string, taskId: string, prompt?: string) => invoke({ method: 'tasks.resume', sessionId, taskId, prompt }),
    closeSession: (sessionId: string) => invoke({ method: 'sessions.close', sessionId }),
    close() { failAll(new Error('Desktop client closed')) },
  }
}
