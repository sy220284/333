export function classifyRipgrepFailure(options: {
  isTimeout: boolean
  isBufferOverflow: boolean
  wasAborted: boolean
  partialResults: string[]
}): { kind: 'cancelled' | 'timeout' | 'incomplete'; message: string }
