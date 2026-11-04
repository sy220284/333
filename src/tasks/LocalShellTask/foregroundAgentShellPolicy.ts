/** Select only live foreground shell commands of the addressed agent. */
export function findForegroundAgentShellTaskIds(tasks, agentId) {
  return Object.entries(tasks)
    .filter(([, task]) => task !== null && typeof task === 'object' &&
      task.type === 'local_bash' && task.agentId === agentId &&
      task.status === 'running' && task.isBackgrounded !== true &&
      task.shellCommand != null)
    .map(([id]) => id)
}
