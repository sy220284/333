/**
 * Find edits between the initial parsed settings and Chokidar's ready event.
 * The set of observed paths prevents replaying events already delivered by
 * the watcher during initialization. Null represents a deleted/missing file.
 */
export function findUnobservedStartupChanges(before: Map<string,string|null>, after: Map<string,string|null>, observed: Set<string>) {
  const paths = new Set([...before.keys(), ...after.keys()])
  const changes = []
  for (const path of paths) {
    if (observed.has(path)) continue
    const original = before.has(path) ? before.get(path) : null
    const current = after.has(path) ? after.get(path) : null
    if (original === undefined || current === undefined || original === current) continue
    changes.push({ path, kind: current === null ? 'delete' : 'change' })
  }
  return changes
}
