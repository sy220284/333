/**
 * Activate a restored session only after all transcript writes have committed.
 * Both ingress v1 and CCR v2 use this ordering; errors propagate unchanged.
 */
export async function commitRestoredSession(persist, activate) {
  await persist()
  activate()
}
