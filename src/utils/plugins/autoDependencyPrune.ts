/**
 * 2.1.317 dependency-pruning graph:
 * manual installations are roots; auto-installed records are removable only
 * when unreachable through the current loaded manifests. A stale/missing
 * plugin disables pruning of the entire scope to prevent data loss.
 */
export function computeAutoDependencyOrphans(installations, loaded, scope, projectPath) {
  const manual = new Set()
  const automatic = new Set()
  for (const [id, entries] of Object.entries(installations ?? {})) {
    const active = entries.find(record =>
      record.scope === scope && record.projectPath === projectPath)
    if (!active) continue
    if (active.auto === true) automatic.add(id)
    else manual.add(id)
  }
  if (!automatic.size) return { orphans: new Set(), unloadable: [], autoCount: 0 }
  const byId = new Map(loaded.map(plugin => [plugin.source, plugin]))
  const unloadable = [...manual, ...automatic].filter(id => !byId.has(id))
  if (unloadable.length) {
    return { orphans: new Set(), unloadable, autoCount: automatic.size }
  }
  const reachable = new Set()
  const qualify = (dep, source) => {
    if (dep.includes('@')) return dep
    const suffix = source.slice(source.lastIndexOf('@') + 1)
    return suffix === 'inline' || suffix === source ? dep : `${dep}@${suffix}`
  }
  function visit(id) {
    if (reachable.has(id)) return
    reachable.add(id)
    const plugin = byId.get(id)
    if (!plugin) return
    for (const dep of plugin.manifest?.dependencies ?? []) visit(qualify(dep, plugin.source))
  }
  for (const root of manual) visit(root)
  return {
    orphans: new Set([...automatic].filter(id => !reachable.has(id))),
    unloadable: [],
    autoCount: automatic.size,
  }
}
