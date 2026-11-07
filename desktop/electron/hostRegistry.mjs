/** Ignore late exit/errors from a replaced desktopHost process.
 * A stale process cannot remove the newly connected host from the workspace. */
export function evictCurrentHost(hosts, workspace, expectedHost) {
  if(hosts.get(workspace) !== expectedHost) return false
  hosts.delete(workspace)
  return true
}
