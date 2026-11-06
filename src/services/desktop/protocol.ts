import { z } from 'zod/v4'
import { PermissionResultSchema, SDKUserMessageSchema } from '../../entrypoints/sdk/coreSchemas.js'
import type { SDKMessage } from '../../entrypoints/sdk/coreTypes.js'
import type { HeadlessSessionSnapshot } from '../conversation/headlessSession.js'
import type { PendingSdkPermission } from '../conversation/permissionBroker.js'
import type { DesktopTask } from './taskProjection.js'

export const DESKTOP_PROTOCOL_VERSION = 1
const id = z.string().min(1).max(128)
const sessionId = z.string().uuid()
const taskId = z.string().min(1).max(256)
const request = <T extends string, S extends z.ZodRawShape>(method: T, shape: S) =>
  z.object({ id, method: z.literal(method), ...shape }).strict()

/** The desktop wire protocol is a local, versioned envelope. SDK payloads
 * stay in their canonical stream-json shapes. */
export const DesktopRequestSchema = z.discriminatedUnion('method', [
  request('hello', {}),
  request('models.list', { sessionId: sessionId.optional() }),
  request('sessions.open', { model: z.string().min(1).optional() }),
  request('sessions.resume', { sessionId }),
  request('sessions.list', { limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional() }),
  request('sessions.history', { sessionId, limit: z.number().int().min(1).max(500).optional(), offset: z.number().int().min(0).optional() }),
  request('sessions.close', { sessionId }),
  request('sessions.status', { sessionId }),
  request('sessions.send', { sessionId, message: z.union([z.string().min(1), SDKUserMessageSchema()]) }),
  request('sessions.interrupt', { sessionId }),
  request('sessions.setModel', { sessionId, model: z.string().min(1) }),
  request('sessions.setPermissionMode', { sessionId, mode: z.enum(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk']) }),
  request('permissions.list', { sessionId }),
  request('permissions.decide', { sessionId, permissionId: id, decision: PermissionResultSchema() }),
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
  | { event: 'permission.request'; sessionId: string; permission: PendingSdkPermission }
  | { event: 'permission.resolved'; sessionId: string; permissionId: string }
  | { event: 'agent.progress'; sessionId: string; turnId: string; task?: DesktopTask; message: SDKMessage }
  | { event: 'task.updated'; sessionId: string; task: DesktopTask }
