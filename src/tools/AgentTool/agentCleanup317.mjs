/**
 * Release all resources owned by an agent, including when one disposer fails.
 * Preserve every failure for diagnosis and ensure later disposers still run.
 */
export async function releaseAgentResources(steps) {
  const failures = []
  for (const [name, dispose] of steps) {
    try {
      await dispose()
    } catch (cause) {
      failures.push(new Error(`Agent resource cleanup failed: ${name}`, { cause }))
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Agent resource cleanup did not finish successfully')
  }
}
