/**
 * A non-zero ripgrep result other than exit code 1 is never a complete search.
 * Callers preserve collected lines for diagnostics while returning an error
 * to the model so it can narrow its search instead of trusting missing files.
 */
export function classifyRipgrepFailure({
  isTimeout,
  isBufferOverflow,
  wasAborted,
  partialResults,
}) : { kind: string; message: string; } {
  if (wasAborted) {
    return {
      kind: 'cancelled',
      message: 'Ripgrep search was cancelled before it completed.',
    }
  }
  const count = partialResults.length
  if (isTimeout) {
    return {
      kind: 'timeout',
      message: `Ripgrep search exceeded its time limit after finding ${count} partial result(s). The result set is incomplete. Narrow the path or pattern and retry.`,
    }
  }
  return {
    kind: 'incomplete',
    message: `Ripgrep search failed${isBufferOverflow ? ' because its output exceeded the buffer limit' : ''} after finding ${count} partial result(s). The result set is incomplete. Narrow the path or pattern and retry.`,
  }
}

/** Determine whether an embedded ripgrep process really finished searching.
 * A clean exit code alone is insufficient after a timeout or bounded output.
 */
export function classifyRipgrepProcessExit({
  code,
  signal,
  timedOut,
  stdoutTruncated,
  stderrTruncated,
  wasAborted,
}) : "cancelled" | "timeout" | "overflow" | "complete" | "failed" {
  if (wasAborted) return 'cancelled'
  if (timedOut) return 'timeout'
  if (stdoutTruncated || stderrTruncated) return 'overflow'
  return signal == null && (code === 0 || code === 1) ? 'complete' : 'failed'
}
