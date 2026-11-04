/**
 * A single deadline for the complete web tool operation: initial HTTP calls,
 * redirects, parsing and secondary model work are all included.
 */
export async function withWebToolDeadline(parent: AbortController, operation, timeoutMs = 300_000) {
  if (parent.signal.aborted) {
    throw parent.signal.reason ?? new Error('Web tool cancelled')
  }
  const child = new AbortController()
  let timer
  let onAbort
  const deadline = new Promise<never>((_, reject) => {
    const finish = reason => {
      child.abort(reason)
      reject(reason)
    }
    onAbort = () => finish(parent.signal.reason ?? new Error('Web tool cancelled'))
    parent.signal.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(
      () => finish(new Error('Web tool did not complete within 300 seconds')),
      timeoutMs,
    )
  })
  try {
    return await Promise.race([operation(child), deadline])
  } finally {
    clearTimeout(timer)
    parent.signal.removeEventListener('abort', onAbort)
  }
}
