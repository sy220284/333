import { createInterface } from 'node:readline/promises'
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
    process.stderr.write(`Invalid scope: ${requestedScope}. Must be one of: user, project, local.\n`)
    process.exitCode = 1
    return
  }
  const scope = requestedScope as Scope
  const projectPath = getProjectPathForScope(scope)
  const state = loadInstalledPluginsV2()
  const plugins = await loadAllPlugins()
  const scan = computeAutoDependencyOrphans(
    state.plugins,
    [...plugins.enabled, ...plugins.disabled],
    scope,
    projectPath,
  )
  if (scan.unloadable.length) {
    process.stdout.write(`Skipped — cannot determine orphans: ${scan.unloadable.join(', ')} failed to load. Fix or uninstall, then retry.\n`)
    return
  }
  if (!scan.orphans.size) {
    process.stdout.write(
      scan.autoCount === 0
        ? `Nothing to prune (no auto-installed plugins at ${scope} scope).\n`
        : `Nothing to prune (${scan.autoCount} auto-installed ${scan.autoCount === 1 ? 'plugin' : 'plugins'} at ${scope} scope, all still needed).\n`,
    )
    return
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
    process.stdout.write(preview + '\n(dry run — nothing removed)\n')
    return
  }
  if (!options.yes) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      process.stdout.write(preview + `\nNot a TTY — run \`claude plugin prune${scope === 'user' ? '' : ` --scope ${scope}`} -y\` to remove.\n`)
      return
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    let reply: string
    try {
      reply = await rl.question(preview + '\nRemove? [y/N] ')
    } finally {
      rl.close()
    }
    if (!/^(y|yes)$/i.test(reply.trim())) {
      process.stdout.write('Aborted.\n')
      return
    }
  }
  const removed: string[] = []
  for (const id of targets) {
    const result = await uninstallPluginOp(id, scope, true)
    if (!result.success) {
      process.stderr.write(`Failed to prune ${id}: ${result.message}\n`)
      process.exitCode = 1
      return
    }
    removed.push(id.split('@')[0] ?? id)
  }
  process.stdout.write(`Removed ${removed.length} auto-installed ${removed.length === 1 ? 'plugin' : 'plugins'}: ${removed.join(', ')}\n`)
}
