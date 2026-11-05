import { descendantTasks, isStoppableTask } from './agentLifecycle317.js'
// Shared logic for stopping a running task.
// Used by TaskStopTool (LLM-invoked) and SDK stop_task control request.

import type { AppState } from '../state/AppState.js'
import type { TaskStatus } from '../Task.js'
import type { TaskState } from './types.js'
import { isInProcessTeammateTask } from './InProcessTeammateTask/types.js'
import { getTaskByType } from '../tasks.js'
import { emitTaskTerminatedSdk } from '../utils/sdkEventQueue.js'
import { isLocalShellTask } from './LocalShellTask/guards.js'

export class StopTaskError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not_found'
      | 'not_running'
      | 'unsupported_type'
      | 'ambiguous'
      | 'not_owner',
    public readonly taskStatus?: TaskStatus,
  ) {
    super(message)
    this.name = 'StopTaskError'
  }
}

export type StopTaskContext = {
  callerAgentId?: string
  getAppState: () => AppState
  setAppState: (f: (prev: AppState) => AppState) => void
}

type StopTaskResult = {
  taskId: string
  taskType: string
  command: string | undefined
}

/**
 * Look up a task by ID, validate it is running, kill it, and mark it as notified.
 *
 * Throws {@link StopTaskError} when the task cannot be stopped (not found,
 * not running, or unsupported type). Callers can inspect `error.code` to
 * distinguish the failure reason.
 */
export async function stopTask(
  taskId: string,
  context: StopTaskContext,
): Promise<StopTaskResult> {
  const { getAppState, setAppState } = context
  const appState = getAppState()
  const task = resolveTaskToStop(taskId, appState)
  const requestedId = taskId
  taskId = task.id

  if (!isStoppableTask(task, appState.tasks)) {
    throw new StopTaskError(
      `Task ${taskId} is not running (status: ${task.status})`,
      'not_running',
      task.status,
    )
  }

  const owner =
    'agentId' in task && typeof task.agentId === 'string'
      ? task.agentId
      : undefined
  if (context.callerAgentId !== undefined && context.callerAgentId !== owner) {
    const label = requestedId === taskId ? taskId : `${requestedId} (${taskId})`
    throw new StopTaskError(
      `Task ${label} is owned by ${owner ?? 'main session'}; agent ${context.callerAgentId} cannot stop it.`,
      'not_owner',
    )
  }

  const taskImpl = getTaskByType(task.type)
  if (!taskImpl) {
    throw new StopTaskError(
      `Unsupported task type: ${task.type}`,
      'unsupported_type',
    )
  }

  const children = task.type === 'local_agent' ? descendantTasks(taskId, appState.tasks).filter(child => isStoppableTask(child, appState.tasks)) : []
  const errors: unknown[] = []
  for (const target of [...children, task]) {
    const latest = getAppState().tasks[target.id]
    if (!latest || latest.status === 'killed' || latest.status === 'failed') continue
    if (latest.status !== 'running' && latest.type !== 'local_agent') continue
    const implementation = target.id === taskId ? taskImpl : getTaskByType(target.type)
    if (!implementation) {
      errors.push(new StopTaskError(`Unsupported task type: ${target.type}`, 'unsupported_type'))
      continue
    }
    try {
      await implementation.kill(target.id, setAppState)
    } catch (error) {
      errors.push(new Error(`Failed to stop task ${target.id}`, { cause: error }))
    }
  }
  if (errors.length) throw new AggregateError(errors, `Task ${taskId} stop was incomplete`)

  // Bash: suppress the "exit code 137" notification (noise). Agent tasks: don't
  // suppress — the AbortError catch sends a notification carrying
  // extractPartialResult(agentMessages), which is the payload not noise.
  if (isLocalShellTask(task)) {
    let suppressed = false
    setAppState(prev => {
      const prevTask = prev.tasks[taskId]
      if (!prevTask || prevTask.notified) {
        return prev
      }
      suppressed = true
      return {
        ...prev,
        tasks: {
          ...prev.tasks,
          [taskId]: { ...prevTask, notified: true },
        },
      }
    })
    // Suppressing the XML notification also suppresses print.ts's parsed
    // task_notification SDK event — emit it directly so SDK consumers see
    // the task close.
    if (suppressed) {
      emitTaskTerminatedSdk(taskId, 'stopped', {
        toolUseId: task.toolUseId,
        summary: task.description,
      })
    }
  }

  const command = isLocalShellTask(task) ? task.command : task.description

  return { taskId, taskType: task.type, command }
}

/** Official 317 Xe/YKn: exact task IDs precede teammate and registered names. */
function normalizeTaskName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, char => (/\s/.test(char) ? char : ''))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
}

export function resolveTaskToStop(
  input: string,
  state: Pick<AppState, 'tasks' | 'agentNameRegistry'>,
): TaskState {
  const tasks = state.tasks
  const exact = Object.hasOwn(tasks, input) ? tasks[input] : undefined
  if (exact) return exact
  const teammates = Object.values(tasks).filter(isInProcessTeammateTask)
  const namedAgent = (
    matches: (name: string) => boolean,
  ): TaskState | undefined => {
    for (const [name, id] of state.agentNameRegistry ?? []) {
      const task = tasks[id]
      if (matches(name) && task?.type === 'local_agent') return task
    }
    return undefined
  }
  const choose = (
    matches: typeof teammates,
    agent: TaskState | undefined,
  ): TaskState | undefined => {
    const byAgent = new Map<string, (typeof teammates)[number]>()
    for (const task of matches) {
      const previous = byAgent.get(task.identity.agentId)
      if (
        !previous ||
        (previous.status !== 'running' && task.status === 'running')
      )
        byAgent.set(task.identity.agentId, task)
    }
    const all = [...byAgent.values()]
    const live = all.filter(task => task.status === 'running')
    const candidates = live.length ? live : all
    if (candidates.length && agent) {
      throw new StopTaskError(
        `"${input}" matches both teammate ${candidates.map(t => t.identity.agentId).join(', ')} and background agent ${agent.id}. Use the full address (name@team) for the teammate or the task ID for the background agent.`,
        candidates.some(t => t.status === 'running') ||
          agent.status === 'running'
          ? 'ambiguous'
          : 'not_running',
        candidates.some(t => t.status === 'running') ||
          agent.status === 'running'
          ? undefined
          : 'completed',
      )
    }
    if (candidates.length > 1)
      throw new StopTaskError(
        `Multiple teammates match "${input}": ${candidates.map(t => t.identity.agentId).join(', ')}. Use the full address (name@team).`,
        candidates.some(t => t.status === 'running')
          ? 'ambiguous'
          : 'not_running',
        candidates.some(t => t.status === 'running') ? undefined : 'completed',
      )
    return candidates[0] ?? agent
  }
  // A full identity picks its live record before historical copies.
  const identityMatches = teammates.filter(
    task => task.identity.agentId === input,
  )
  const resumableMatches = teammates.filter(
    task => task.identity.resumableAgentId === input,
  )
  const identity =
    identityMatches.find(task => task.status === 'running') ??
    identityMatches[0] ??
    resumableMatches.find(task => task.status === 'running') ??
    resumableMatches[0]
  const exactAgent = namedAgent(name => name === input)
  const found = choose(
    identity
      ? [identity]
      : teammates.filter(task => task.identity.agentName === input),
    exactAgent,
  )
  if (found) return found
  const normalized = normalizeTaskName(input)
  const normalizedMatch = choose(
    teammates.filter(
      task => normalizeTaskName(task.identity.agentName) === normalized,
    ),
    namedAgent(name => normalizeTaskName(name) === normalized),
  )
  if (normalizedMatch) return normalizedMatch
  let message = `No task found with ID: ${input}`
  const suggestions = new Map<string, string>()
  for (const task of teammates)
    if (task.status === 'running')
      suggestions.set(
        normalizeTaskName(task.identity.agentName),
        task.identity.agentId,
      )
  for (const [name, id] of state.agentNameRegistry ?? [])
    if (tasks[id]?.type === 'local_agent' && tasks[id]?.status === 'running')
      suggestions.set(normalizeTaskName(name), name)
  let closest: string | undefined
  let distance = 3
  for (const name of suggestions.keys()) {
    const current = taskNameDistance(normalized, name)
    if (current < distance) {
      closest = name
      distance = current
    }
  }
  if (closest !== undefined)
    message += `. Did you mean: ${suggestions.get(closest)}?`
  const runningTeammates = teammates
    .filter(t => t.status === 'running')
    .map(t => t.identity.agentId)
  if (runningTeammates.length)
    message += `. Running teammates: ${runningTeammates.join(', ')}`
  const runningNames = [...(state.agentNameRegistry ?? [])]
    .filter(
      ([, id]) =>
        tasks[id]?.type === 'local_agent' && tasks[id]?.status === 'running',
    )
    .map(([name]) => name)
  if (runningNames.length)
    message += `. Running named agents: ${runningNames.join(', ')}`
  throw new StopTaskError(message, 'not_found')
}

/** Banded Damerau distance, matching 317 ece with a two-edit bound. */
function taskNameDistance(left: string, right: string): number {
  if (left === right) return 0
  if (Math.abs(left.length - right.length) > 2) return 3
  let before = new Int32Array(right.length + 2).fill(3)
  let previous = new Int32Array(right.length + 2).fill(3)
  let current = new Int32Array(right.length + 2).fill(3)
  for (let j = 0; j <= Math.min(right.length, 2); j++) previous[j] = j
  for (let i = 1; i <= left.length; i++) {
    const start = Math.max(1, i - 2),
      end = Math.min(right.length, i + 2)
    current[start - 1] = start === 1 ? Math.min(i, 3) : 3
    let smallest = current[start - 1]!
    for (let j = start; j <= end; j++) {
      let value = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1),
        3,
      )
      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1]
      )
        value = Math.min(value, before[j - 2]! + 1)
      current[j] = value
      smallest = Math.min(smallest, value)
    }
    current[end + 1] = 3
    if (smallest > 2) return 3
    ;[before, previous, current] = [previous, current, before]
  }
  return previous[right.length]!
}
