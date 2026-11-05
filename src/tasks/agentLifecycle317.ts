import type { TaskState } from './types.js'

export function ownedTaskAgent(task: TaskState): string | undefined {
  if (task.type === 'local_agent') return task.parentAgentId
  if (task.type === 'local_bash' || task.type === 'monitor_ws') return task.agentId
  return undefined
}

export function isStoppableTask(task: TaskState, tasks: Record<string, TaskState>): boolean {
  if (task.status === 'running') return true
  if (task.type !== 'local_agent' || task.status !== 'completed') return false
  return descendantTasks(task.id, tasks).some(child => child.status === 'running')
}

/** Take a stable snapshot before stopping anything. Fork and exempt branches own their lifetime. */
export function descendantTasks(id: string, tasks: Record<string, TaskState>): TaskState[] {
  const children = new Map<string, TaskState[]>()
  for (const task of Object.values(tasks)) {
    const owner = ownedTaskAgent(task)
    if (!owner) continue
    const siblings = children.get(owner) ?? []
    siblings.push(task)
    children.set(owner, siblings)
  }

  const result: TaskState[] = []
  const visited = new Set([id])
  const pending = [...children.get(id) ?? []]
  for (const child of pending) {
    if (visited.has(child.id)) continue
    visited.add(child.id)
    if (child.type === 'local_agent' && child.cascadeStopExempt) continue
    result.push(child)
    if (child.type === 'local_agent') {
      const owned = children.get(child.id) ?? []
      pending.push(...(child.forkWorker ? owned.filter(task => task.type !== 'local_agent') : owned))
    }
  }
  return result.reverse()
}
