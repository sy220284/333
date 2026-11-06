import type { SDKMessage } from '../../entrypoints/sdk/coreTypes.js'

export type DesktopTask = {
  taskId: string
  description: string
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'interrupted'
  updatedAt: number
  toolUseId?: string
  taskType?: string
  workflowName?: string
  runId?: string
  isBackgrounded?: boolean
  endTime?: number
  totalPausedMs?: number
  error?: unknown
  summary?: string
  lastToolName?: string
  outputFile?: string
  usage?: { total_tokens: number; tool_uses: number; duration_ms: number }
}

const terminalStatuses = new Set<DesktopTask['status']>(['completed', 'failed', 'stopped'])
const taskStatuses = new Set<DesktopTask['status']>([
  'running', 'completed', 'failed', 'stopped', 'interrupted',
])

/** Consume the SDK's real task_started/task_progress/task_notification events.
 * No polling or inference from rendered Ink widgets. */
export function projectTask(
  message: SDKMessage,
  previous: DesktopTask | undefined,
  now: number = Date.now(),
): DesktopTask | undefined {
  if (message.type !== 'system') return undefined
  if (message.subtype === 'task_started') {
    return {
      ...previous,
      taskId: message.task_id,
      description: message.description,
      status: previous && terminalStatuses.has(previous.status) ? previous.status : 'running', updatedAt: now,
      ...(message.tool_use_id && { toolUseId: message.tool_use_id }),
      ...(message.task_type && { taskType: message.task_type }),
      ...(message.workflow_name && { workflowName: message.workflow_name }),
    }
  }
  // 2.1.317 emits patch-style task updates independently of the older
  // notification and progress events. Preserve the last terminal state when
  // delayed, duplicate or out-of-order updates arrive.
  if (message.subtype === 'task_updated') {
    const patch = message.patch
    const requestedStatus = patch.status
    const nextStatus = typeof requestedStatus === 'string' &&
      taskStatuses.has(requestedStatus as DesktopTask['status'])
      ? requestedStatus as DesktopTask['status'] : previous?.status ?? 'running'
    const status = previous && terminalStatuses.has(previous.status)
      ? previous.status : nextStatus
    return {
      ...previous,
      taskId: message.task_id,
      description: typeof patch.description === 'string'
        ? patch.description : previous?.description ?? message.task_id,
      ...(typeof message.run_id === 'string' && { runId: message.run_id }),
      ...(typeof patch.is_backgrounded === 'boolean' && { isBackgrounded: patch.is_backgrounded }),
      ...(typeof patch.end_time === 'number' && { endTime: patch.end_time }),
      ...(typeof patch.total_paused_ms === 'number' && { totalPausedMs: patch.total_paused_ms }),
      ...(patch.error !== undefined && { error: patch.error }),
      status,
      updatedAt: now,
      ...(typeof patch.summary === 'string' && { summary: patch.summary }),
      ...(typeof patch.last_tool_name === 'string' && { lastToolName: patch.last_tool_name }),
      ...(typeof patch.output_file === 'string' && { outputFile: patch.output_file }),
      ...(typeof patch.tool_use_id === 'string' && { toolUseId: patch.tool_use_id }),
      ...(typeof patch.task_type === 'string' && { taskType: patch.task_type }),
      ...(typeof patch.workflow_name === 'string' && { workflowName: patch.workflow_name }),
      ...(patch.usage && typeof patch.usage === 'object' &&
        'total_tokens' in patch.usage && 'tool_uses' in patch.usage &&
        'duration_ms' in patch.usage && {
          usage: patch.usage as DesktopTask['usage'],
        }),
    }
  }
  if (message.subtype === 'task_progress') {
    return {
      taskId: message.task_id,
      description: message.description || previous?.description || message.task_id,
      status: previous?.status === 'completed' || previous?.status === 'failed' ||
        previous?.status === 'stopped' ? previous.status : 'running',
      updatedAt: now, 
      ...previous,
      ...(previous?.toolUseId && { toolUseId: previous.toolUseId }),
      ...(message.tool_use_id && { toolUseId: message.tool_use_id }),
      ...(previous?.taskType && { taskType: previous.taskType }),
      ...(previous?.workflowName && { workflowName: previous.workflowName }),
      ...(message.summary && { summary: message.summary }),
      ...(message.last_tool_name && { lastToolName: message.last_tool_name }),
      usage: message.usage,
    }
  }
  if (message.subtype === 'task_notification') {
    return {
      ...previous,
      taskId: message.task_id,
      description: previous?.description ?? message.task_id,
      status: previous && terminalStatuses.has(previous.status) ? previous.status : message.status,
      updatedAt: now,
      ...(previous?.taskType && { taskType: previous.taskType }),
      ...(previous?.workflowName && { workflowName: previous.workflowName }),
      ...((message.tool_use_id ?? previous?.toolUseId) && {
        toolUseId: message.tool_use_id ?? previous?.toolUseId,
      }),
      ...(message.summary && { summary: message.summary }),
      ...(message.output_file && { outputFile: message.output_file }),
      ...((message.usage ?? previous?.usage) && { usage: message.usage ?? previous?.usage }),
    }
  }
  return undefined
}

export function isAgentProgress(message: SDKMessage): boolean {
  if (message.type === 'tool_progress') return !!message.task_id || message.tool_name === 'Agent' || message.tool_name === 'Task'
  return message.type === 'system' && (
    message.subtype === 'task_started' ||
    message.subtype === 'task_progress' ||
    message.subtype === 'task_notification' ||
    message.subtype === 'task_updated' ||
    message.subtype === 'background_tasks_changed'
  )
}

/** Reconcile background tasks using the authoritative 2.1.317 collection event.
 * Missing entries lose the background flag; they are never marked completed
 * without an explicit terminal event from the SDK. */
export function projectBackgroundTasks(
  message: SDKMessage,
  existing: ReadonlyMap<string, DesktopTask>,
  now: number = Date.now(),
): DesktopTask[] {
  if (message.type !== 'system' || message.subtype !== 'background_tasks_changed') return []
  const active = new Set<string>()
  const result: DesktopTask[] = []
  for (const item of message.tasks) {
    if (!item.task_id) continue
    active.add(item.task_id)
    const previous = existing.get(item.task_id)
    const requestedStatus = item.status
    const status = previous && terminalStatuses.has(previous.status)
      ? previous.status
      : typeof requestedStatus === 'string' &&
        taskStatuses.has(requestedStatus as DesktopTask['status'])
        ? requestedStatus as DesktopTask['status'] : previous?.status ?? 'running'
    const next: DesktopTask = {
      ...previous,
      taskId: item.task_id,
      description: previous?.description ?? item.task_id,
      status,
      updatedAt: now,
      isBackgrounded: true,
      ...(item.task_type && { taskType: item.task_type }),
    }
    result.push(next)
  }
  for (const previous of existing.values()) {
    if (previous.isBackgrounded && !active.has(previous.taskId)) {
      result.push({ ...previous, isBackgrounded: false, updatedAt: now })
    }
  }
  return result
}
