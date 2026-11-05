/**
 * Task-scoped remote poll registrations. A task replacement cancels the
 * previous timer; killing a task releases its timer and registry entry.
 */
export type RemotePollingRegistry317 = {
  register(taskId: string, stopPolling: () => void): () => void
  stop(taskId: string): void
  has(taskId: string): boolean
}
export function createRemotePollingRegistry(): RemotePollingRegistry317 {
  const pollers = new Map<string, () => void>()
  return {
    register(taskId, stopPolling) {
      pollers.get(taskId)?.()
      let released = false
      const release = () => {
        if (released) return
        released = true
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
