export declare function createRemotePollingRegistry(): {
  register(taskId: string, stopPolling: () => void): () => void
  stop(taskId: string): void
  has(taskId: string): boolean
}
