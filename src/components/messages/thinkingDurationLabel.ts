/**
 * Snapshot the finished thinking phase in the transcript.  This is a display
 * label only; the underlying thinking block stays private/folded by default.
 */
export function thinkingDurationLabel(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new RangeError('Thinking duration must be a nonnegative finite number')
  }
  return `Thought for ${Math.max(1, Math.floor(milliseconds / 1000))}s`
}
