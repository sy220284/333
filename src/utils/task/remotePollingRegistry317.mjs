/**
 * Task-scoped remote poll registrations. A task replacement cancels the
 * previous timer; killing a task releases its timer and registry entry.
 */
export function createRemotePollingRegistry() {
  const pollers = new Map()
  return {
    register(taskId, stopPolling) {
      pollers.get(taskId)?.()
      const release = () => {
        if (pollers.get(taskId) === release) pollers.delete(taskId)
        stopPolling()
      }
      pollers.set(taskId, release)
      return release
    },
    stop(taskId) {
      pollers.get(taskId)?.()
    },
    has(taskId) { return pollers.has(taskId) },
  }
}
