/**
 * A headless MCP server can request elicitation while a tool call is running.
 * Track the outstanding request on the actual MCP client, not by server name:
 * the same server name may belong to multiple sessions, and old clients must
 * never affect a replacement connection. Weak keys avoid retaining clients.
 */
const pending = new WeakMap<object, number>()

export function beginHeadlessMcpElicitation(client: object): () => void {
  pending.set(client, (pending.get(client) ?? 0) + 1)
  let settled = false
  return () => {
    if (settled) return
    settled = true
    const remaining = (pending.get(client) ?? 0) - 1
    if (remaining > 0) pending.set(client, remaining)
    else pending.delete(client)
  }
}

export function isHeadlessMcpElicitationPending(client: object): boolean {
  return (pending.get(client) ?? 0) > 0
}
