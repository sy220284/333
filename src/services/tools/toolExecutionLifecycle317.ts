/**
 * Lifetime ownership for both serial and parallel tool streams.
 * The in-progress ID must be removed on success, failure, interruption and
 * early iterator close. Errors are deliberately allowed to propagate.
 */
export type ActiveToolIdsUpdate = (update: (previous: Set<string>) => Set<string>) => void

export async function* withToolInProgress<T>(
  setInProgressToolUseIDs: ActiveToolIdsUpdate,
  id: string,
  createStream: () => AsyncIterable<T>,
): AsyncGenerator<T, void, unknown> {
  setInProgressToolUseIDs(previous => new Set(previous).add(id))
  try {
    yield* createStream()
  } finally {
    setInProgressToolUseIDs(previous => {
      const next = new Set(previous)
      next.delete(id)
      return next
    })
  }
}

/**
 * Observe an eagerly running streamed tool without leaving a detached rejected
 * .finally() promise. Consumers still receive the original rejection from the
 * returned tracked promise, while queued tools resume only after success.
 */
export function observeToolExecutionPromise<T>(
  execution: Promise<T>,
  onSettled: () => void | PromiseLike<void>,
  onCompleted: (value: T) => void | PromiseLike<void>,
  onError: (error: unknown) => void,
): Promise<T> {
  const tracked = execution.finally(onSettled)
  void tracked.then(onCompleted).catch(onError)
  return tracked
}
