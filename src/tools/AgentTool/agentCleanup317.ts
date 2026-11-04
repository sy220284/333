/**
 * Release all resources owned by an agent, including when one disposer fails.
 * Preserve every failure for diagnosis and ensure later disposers still run.
 */
export async function releaseAgentResources(steps, primaryFailure) {
  const failures = []
  for (const [name, dispose] of steps) {
    try {
      await dispose()
    } catch (cause) {
      failures.push(new Error(`Agent resource cleanup failed: ${name}`, { cause }))
    }
  }
  if (failures.length > 0) {
    // Preserve the original query failure alongside any cleanup errors.
    const errors = primaryFailure === undefined ? failures : [primaryFailure, ...failures]
    throw new AggregateError(
      errors,
      primaryFailure === undefined
        ? 'Agent resource cleanup did not finish successfully'
        : 'Agent execution failed and its cleanup also failed',
      { cause: primaryFailure },
    )
  }
}
