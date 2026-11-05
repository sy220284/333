// Pure (non-React) kill helpers for LocalShellTask.
// Extracted so runAgent.ts can kill agent-scoped bash tasks without pulling
// React/Ink into its module graph (same rationale as guards.ts).

import type { AppState } from '../../state/AppState.js'
import type { AgentId } from '../../types/ids.js'
import { logForDebugging } from '../../utils/debug.js'
import { logError } from '../../utils/log.js'
import { dequeueAllMatching } from '../../utils/messageQueueManager.js'
import { emitTaskTerminatedSdk } from '../../utils/sdkEventQueue.js'
import {
  evictTaskOutput,
  getTaskOutputPath,
} from '../../utils/task/diskOutput.js'
import { updateTaskState } from '../../utils/task/framework.js'
import { isLocalShellTask } from './guards.js'

type SetAppStateFn = (updater: (prev: AppState) => AppState) => void

export function killTask(taskId: string, setAppState: SetAppStateFn): Promise<import('../../utils/ShellCommand.js').ExecResult> | undefined {
  let completion: Promise<import('../../utils/ShellCommand.js').ExecResult> | undefined
  let notification: { toolUseId?: string; description: string } | undefined
  updateTaskState(taskId, setAppState, task => {
    if (task.status !== 'running' || !isLocalShellTask(task)) {
      return task
    }

    try {
      logForDebugging(`LocalShellTask ${taskId} kill requested`)
      completion=task.shellCommand?.result
      task.shellCommand?.kill()
      task.shellCommand?.cleanup()
    } catch (error) {
      logError(error)
    }

    if (!task.notified)
      notification = {
        toolUseId: task.toolUseId,
        description: task.description,
      }
    task.unregisterCleanup?.()
    if (task.cleanupTimeoutId) {
      clearTimeout(task.cleanupTimeoutId)
    }

    return {
      ...task,
      status: 'killed',
      notified: true,
      shellCommand: null,
      unregisterCleanup: undefined,
      cleanupTimeoutId: undefined,
      endTime: Date.now(),
    }
  })
  if (notification) {
    emitTaskTerminatedSdk(taskId, 'stopped', {
      toolUseId: notification.toolUseId,
      summary: notification.description,
      outputFile: getTaskOutputPath(taskId),
    })
  }
  void evictTaskOutput(taskId)
  return completion
}

/**
 * Kill all running bash tasks spawned by a given agent.
 * Called from runAgent.ts finally block so background processes don't outlive
 * the agent that started them (prevents 10-day fake-logs.sh zombies).
 */
export function killShellTasksForAgent(
  agentId: AgentId,
  getAppState: () => AppState,
  setAppState: SetAppStateFn,
): void {
  const tasks = getAppState().tasks ?? {}
  for (const [taskId, task] of Object.entries(tasks)) {
    if (
      isLocalShellTask(task) &&
      task.agentId === agentId &&
      task.status === 'running'
    ) {
      logForDebugging(
        `killShellTasksForAgent: killing orphaned shell task ${taskId} (agent ${agentId} exiting)`,
      )
      killTask(taskId, setAppState)
    }
  }
  // Purge any queued notifications addressed to this agent — its query loop
  // has exited and won't drain them. killTask fires 'killed' notifications
  // asynchronously; drop the ones already queued and any that land later sit
  // harmlessly (no consumer matches a dead agentId).
  dequeueAllMatching(cmd => cmd.agentId === agentId)
}
