import { z } from 'zod/v4'
import { PermissionResultSchema, SDKUserMessageSchema } from '../../entrypoints/sdk/coreSchemas.js'
import type { SDKMessage } from '../../entrypoints/sdk/coreTypes.js'
import type { HeadlessSessionSnapshot } from '../conversation/headlessSession.js'
import type { PendingSdkPermission } from '../conversation/permissionBroker.js'
import type { PendingHostControl } from '../conversation/hostControlBroker.js'
import type { DesktopTask } from './taskProjection.js'

export const DESKTOP_PROTOCOL_VERSION = 1
const id = z.string().min(1).max(128)
const sessionId = z.string().uuid()
const taskId = z.string().min(1).max(256)
const missionId = z.string().regex(/^mission_[a-f0-9]{16}$/)
const jobId = z.string().regex(/^job_[a-f0-9]{16}$/)
const request = <T extends string, S extends z.ZodRawShape>(method: T, shape: S) =>
  z.object({ id, method: z.literal(method), ...shape }).strict()

/** The desktop wire protocol is a local, versioned envelope. SDK payloads
 * stay in their canonical stream-json shapes. */
export const DesktopRequestSchema = z.discriminatedUnion('method', [
  request('hello', {}),
  request('models.list', { sessionId: sessionId.optional() }),
  request('mcp.list', {}),
  request('mcp.add', { name: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), scope: z.enum(['project', 'user', 'local']), config: z.union([
    z.object({ type: z.literal('http'), url: z.string().url().max(2048) }).strict(),
    z.object({ type: z.literal('sse'), url: z.string().url().max(2048) }).strict(),
    z.object({ type: z.literal('stdio'), command: z.string().trim().min(1).max(1024), args: z.array(z.string().max(1000)).max(80) }).strict()
  ]) }),
  request('mcp.remove', { name: z.string().min(1), scope: z.enum(['project','user','local']) }),
  request('mcp.toggle', { name: z.string().min(1), enabled: z.boolean() }),
  request('sessions.open', { model: z.string().min(1).optional() }),
  request('sessions.resume', { sessionId }),
  // Resume only on an explicit user action; an already active session is reused.
  request('sessions.ensureOpen', { sessionId }),
  request('sessions.list', { limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional() }),
  request('sessions.history', { sessionId, limit: z.number().int().min(1).max(500).optional(), offset: z.number().int().min(0).optional() }),
  request('sessions.close', { sessionId }),
  request('sessions.status', { sessionId }),
  request('sessions.send', { sessionId, message: z.union([z.string().min(1), SDKUserMessageSchema()]) }),
  request('sessions.interrupt', { sessionId }),
  request('sessions.setModel', { sessionId, model: z.string().min(1) }),
  request('sessions.setPermissionMode', { sessionId, mode: z.enum(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk']) }),
  request('host.list', { sessionId }),
  request('host.respond', { sessionId, requestId: id, response: z.record(z.string(), z.unknown()) }),
  request('host.reject', { sessionId, requestId: id, reason: z.string().min(1).max(2000) }),
  request('permissions.list', { sessionId }),
  request('permissions.decide', { sessionId, permissionId: id, decision: PermissionResultSchema() }),
  request('agents.overview', {}),
  request('agents.members', { teamName: z.string().min(1).max(128) }),
  request('agents.setMode', { mode: z.enum(['master', 'super']) }),
  request('missions.list', {}),
  request('missions.get', { missionId }),
  request('missions.create', { objective: z.string().trim().min(1).max(4000) }),
  request('missions.select', { missionId: missionId.nullable() }),
  request('missions.updateStatus', { missionId, status: z.enum(['active', 'paused', 'completed']) }),
  request('missions.checkpoint', { missionId, checkpoint: z.string().trim().min(1).max(6000) }),
  request('missions.jobs.list', { missionId }),
  request('missions.jobs.enqueue', { missionId, title: z.string().trim().min(1).max(200), instruction: z.string().trim().min(1).max(6000) }),
  request('missions.jobs.start', { missionId, jobId }),
  request('missions.jobs.runBatch', { missionId, limit: z.number().int().min(1).max(3).optional() }),
  request('missions.jobs.runQueue', { missionId }),
  request('missions.jobs.haltQueue', { missionId }),
  request('missions.jobs.queueStatus', { missionId }),
  request('missions.jobs.approve', { missionId, jobId }),
  request('missions.jobs.retry', { missionId, jobId }),
  request('missions.jobs.recover', { missionId, jobId }),
  request('missions.jobs.cancel', { missionId, jobId }),
  request('tasks.list', { sessionId }),
  request('tasks.stop', { sessionId, taskId }),
  request('tasks.resume', { sessionId, taskId, prompt: z.string().min(1).optional() }),
])

export type DesktopRequest = z.infer<typeof DesktopRequestSchema>
export type DesktopReply =
  | { id: string; ok: true; result: unknown }
  | { id: string | null; ok: false; error: { code: string; message: string } }

export type DesktopEvent =
  | { event: 'session.state'; sessionId: string; state: HeadlessSessionSnapshot }
  | { event: 'session.message'; sessionId: string; turnId: string; message: SDKMessage }
  | { event: 'session.error'; sessionId: string; turnId?: string; error: string }
  | { event: 'host.request'; sessionId: string; request: PendingHostControl }
  | { event: 'host.resolved'; sessionId: string; requestId: string }
  | { event: 'permission.request'; sessionId: string; permission: PendingSdkPermission }
  | { event: 'permission.resolved'; sessionId: string; permissionId: string }
  | { event: 'agent.progress'; sessionId: string; turnId: string; task?: DesktopTask; message: SDKMessage }
  | { event: 'task.updated'; sessionId: string; task: DesktopTask }
  | { event: 'mission.job.updated'; missionId: string; job: import('../agentCenter/missionJobs.js').MissionJob }
  | { event: 'mission.queue.state'; missionId: string; active: boolean; message?: string }
  | { event: 'task.persistence.error'; sessionId: string; error: string }
