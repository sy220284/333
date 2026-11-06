import type { SDKMessage } from '../../entrypoints/sdk/coreTypes.js'

export type DesktopTask = {
  taskId: string
  description: string
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'interrupted'
  updatedAt: number
  toolUseId?: string
  taskType?: string
  workflowName?: string
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
  if ((message as { subtype: string }).subtype === 'task_updated') {
    const update = message as unknown as {
      task_id?: string
      patch?: Record<string, unknown>
    }
    if (!update.task_id || !update.patch || typeof update.patch !== 'object') return undefined
    const patch = update.patch
    const requestedStatus = patch.status
    const nextStatus = typeof requestedStatus === 'string' &&
      taskStatuses.has(requestedStatus as DesktopTask['status'])
      ? requestedStatus as DesktopTask['status'] : previous?.status ?? 'running'
    const status = previous && terminalStatuses.has(previous.status)
      ? previous.status : nextStatus
    return {
      ...previous,
      taskId: update.task_id,
      description: typeof patch.description === 'string'
        ? patch.description : previous?.description ?? update.task_id,
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
    (message as { subtype: string }).subtype === 'task_updated' ||
    (message as { subtype: string }).subtype === 'background_tasks_changed'
  )
}
