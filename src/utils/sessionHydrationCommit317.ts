/**
 * Activate a restored session only after all transcript writes have committed.
 * Both ingress v1 and CCR v2 use this ordering; errors propagate unchanged.
 */
export async function commitRestoredSession(persist, activate) : Promise<void> {
  await persist()
  activate()
}

/** Null from session-ingress means that authentication or fetch failed. */
export function requireFetchedSessionEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new Error('Remote session transcript fetch failed; existing session was preserved')
  }
  return entries
}
