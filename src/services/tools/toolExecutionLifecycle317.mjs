/**
 * Lifetime ownership for both serial and parallel tool streams.
 * The in-progress ID must be removed on success, failure, interruption and
 * early iterator close. Errors are deliberately allowed to propagate.
 */
export async function* withToolInProgress(setInProgressToolUseIDs, id, createStream) {
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
