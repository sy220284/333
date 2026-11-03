export function classifyRipgrepFailure(options: {
  isTimeout: boolean
  isBufferOverflow: boolean
  wasAborted: boolean
  partialResults: string[]
}): { kind: 'cancelled' | 'timeout' | 'incomplete'; message: string }

export function classifyRipgrepProcessExit(options: {
  code: number | null
  signal: NodeJS.Signals | null
  timedOut: boolean
  stdoutTruncated: boolean
  stderrTruncated: boolean
  wasAborted: boolean
}): 'complete' | 'timeout' | 'overflow' | 'cancelled' | 'failed'
