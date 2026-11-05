/**
 * A single deadline for the complete web tool operation: initial HTTP calls,
 * redirects, parsing and secondary model work are all included.
 */
export async function withWebToolDeadline<T>(parent: AbortController, operation: (child: AbortController) => PromiseLike<T> | T, timeoutMs: number = 300_000): Promise<T> {
  if (parent.signal.aborted) {
    throw parent.signal.reason ?? new Error('Web tool cancelled')
  }
  const child = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  const deadline = new Promise<never>((_, reject) => {
    const finish = (reason: unknown): void => {
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
    if (onAbort) parent.signal.removeEventListener('abort', onAbort)
  }
}
