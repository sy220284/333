/** Select only live foreground shell commands of the addressed agent. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
export function findForegroundAgentShellTaskIds(tasks, agentId) : string[] {
  return Object.entries(tasks)
    .filter(([, task]) => isRecord(task) &&
      task.type === 'local_bash' && task.agentId === agentId &&
      task.status === 'running' && task.isBackgrounded !== true &&
      task.shellCommand != null)
    .map(([id]) => id)
}
