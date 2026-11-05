/**
 * Shared MCP connection-policy decision for 2.1.310 reconnection.
 * Keep this pure so CLI, SDK and interactive paths use the same priority.
 */
export function resolveMcpReconnectBlockReason(
  disabled: boolean,
  allowedByPolicy: boolean,
): 'disabled' | 'managed-policy' | null {
  if (disabled) return 'disabled'
  if (!allowedByPolicy) return 'managed-policy'
  return null
}

/**
 * An uncertain transport failure may arrive after a remote tool executed.
 * Repeating a non-idempotent write could duplicate its side effects.
 */
export function canRetryMcpToolAfterSessionLoss(
  mayHaveRun: boolean,
  concurrencySafe: boolean,
  idempotent: boolean,
): boolean {
  return !mayHaveRun || concurrencySafe || idempotent
}
