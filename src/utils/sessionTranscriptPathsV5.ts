/**
 * Per-conversation path ownership for the current process. A resumed session
 * may live outside originalCwd (for example in another worktree); once the
 * actual transcript path is known, async writes must not guess its location.
 */
export class SessionTranscriptPathsV5 {
  private readonly paths = new Map<string, string>()

  remember(sessionId: string, path: string): string {
    if (!sessionId || !path) throw new TypeError('Session transcript identity and path are required')
    this.paths.set(sessionId, path)
    return path
  }

  resolve(sessionId: string, fallback: () => string): string {
    return this.paths.get(sessionId) ?? fallback()
  }
}
