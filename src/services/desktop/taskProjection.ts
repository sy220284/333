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
      status: 'running', updatedAt: now,
      ...(message.tool_use_id && { toolUseId: message.tool_use_id }),
      ...(message.task_type && { taskType: message.task_type }),
      ...(message.workflow_name && { workflowName: message.workflow_name }),
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
      status: message.status,
      updatedAt: now,
      ...(previous?.taskType && { taskType: previous.taskType }),
      ...(previous?.workflowName && { workflowName: previous.workflowName }),
      ...(message.tool_use_id && { toolUseId: message.tool_use_id }),
      ...(message.summary && { summary: message.summary }),
      ...(message.output_file && { outputFile: message.output_file }),
      ...(message.usage && { usage: message.usage }),
    }
  }
  return undefined
}

export function isAgentProgress(message: SDKMessage): boolean {
  if (message.type === 'tool_progress') return !!message.task_id || message.tool_name === 'Agent' || message.tool_name === 'Task'
  return message.type === 'system' && (
    message.subtype === 'task_started' ||
    message.subtype === 'task_progress' ||
    message.subtype === 'task_notification'
  )
}
