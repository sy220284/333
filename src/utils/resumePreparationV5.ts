/**
 * Pure pre-commit resume preparation. Resolution of the owning session and
 * transcript path happens before restoring skills, file history or running
 * SessionStart hooks. In particular, direct .jsonl resumes retain the exact
 * source path instead of falling back to the current project directory.
 */
export function precomputeResumeCommitV5<T>(
  messages: readonly T[],
  sessionId: string | undefined,
  sourceJsonlFile: string | undefined,
  logFullPath: string | undefined,
): { readonly messages: T[]; readonly sessionId: string | undefined; readonly fullPath: string | undefined } {
  if (!Array.isArray(messages)) {
    throw new TypeError('Resume source must supply a message list')
  }
  return {
    messages: [...messages],
    sessionId,
    fullPath: sourceJsonlFile ?? logFullPath,
  }
}
