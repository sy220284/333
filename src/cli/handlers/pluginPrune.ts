import { createInterface } from 'node:readline/promises'
import { cliError, cliOk } from '../exit.js'
import {
  getProjectPathForScope,
  uninstallPluginOp,
  VALID_INSTALLABLE_SCOPES,
} from '../../services/plugins/pluginOperations.js'
import { computeAutoDependencyOrphans } from '../../utils/plugins/autoDependencyPrune.mjs'
import { loadInstalledPluginsV2 } from '../../utils/plugins/installedPluginsManager.js'
import { loadAllPlugins } from '../../utils/plugins/pluginLoader.js'

type Scope = 'user' | 'project' | 'local'

export async function pluginPruneHandler(options: {
  scope?: string
  dryRun?: boolean
  yes?: boolean
}): Promise<void> {
  const requestedScope = options.scope ?? 'user'
  if (!VALID_INSTALLABLE_SCOPES.includes(requestedScope as Scope)) {
    return cliError(`Invalid scope: ${requestedScope}. Must be one of: user, project, local.`)
  }
  const scope = requestedScope as Scope
  const projectPath = getProjectPathForScope(scope)
  const state = loadInstalledPluginsV2()
  // The installed registry is sufficient to prove that an empty auto-installed
  // set has no prune candidates. Avoid loading every plugin (including remote
  // and MCP sources) when there is nothing to remove.
  const preliminary = computeAutoDependencyOrphans(
    state.plugins,
    [],
    scope,
    projectPath,
  )
  const scan = preliminary.autoCount === 0
    ? preliminary
    : await (async () => {
        const plugins = await loadAllPlugins()
        return computeAutoDependencyOrphans(
          state.plugins,
          [...plugins.enabled, ...plugins.disabled],
          scope,
          projectPath,
        )
      })()
  if (scan.unloadable.length) {
    return cliOk(`Skipped — cannot determine orphans: ${scan.unloadable.join(', ')} failed to load. Fix or uninstall, then retry.`)
  }
  if (!scan.orphans.size) {
    return cliOk(
      scan.autoCount === 0
        ? `Nothing to prune (no auto-installed plugins at ${scope} scope).`
        : `Nothing to prune (${scan.autoCount} auto-installed ${scan.autoCount === 1 ? 'plugin' : 'plugins'} at ${scope} scope, all still needed).`,
    )
  }
  const targets = [...scan.orphans]
  const details = targets.map(id => {
    const installation = state.plugins[id]?.find(
      record => record.scope === scope && record.projectPath === projectPath,
    )
    return `  ${id}${installation?.version ? ` (${installation.version})` : ''}`
  })
  const preview = `${targets.length} auto-installed ${targets.length === 1 ? 'plugin' : 'plugins'} no longer needed at ${scope} scope:\n${details.join('\n')}`
  if (options.dryRun) {
    return cliOk(preview + '\n(dry run — nothing removed)')
  }
  if (!options.yes) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return cliOk(preview + `\nNot a TTY — run \`claude plugin prune${scope === 'user' ? '' : ` --scope ${scope}`} -y\` to remove.`)
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    let reply: string
    try {
      reply = await rl.question(preview + '\nRemove? [y/N] ')
    } finally {
      rl.close()
    }
    if (!/^(y|yes)$/i.test(reply.trim())) {
      return cliOk('Aborted.')
    }
  }
  const removed: string[] = []
  for (const id of targets) {
    const result = await uninstallPluginOp(id, scope, true)
    if (!result.success) {
      return cliError(`Failed to prune ${id}: ${result.message}`)
    }
    removed.push(id.split('@')[0] ?? id)
  }
  return cliOk(`Removed ${removed.length} auto-installed ${removed.length === 1 ? 'plugin' : 'plugins'}: ${removed.join(', ')}`)
}
