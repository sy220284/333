/**
 * Plugin and marketplace subcommand handlers — extracted from main.tsx for lazy loading.
 * These are dynamically imported only when `claude plugin *` or `claude plugin marketplace *` runs.
 */
/* eslint-disable custom-rules/no-process-exit -- CLI subcommand handlers intentionally exit */
import figures from 'figures'
import { basename, dirname } from 'path'
import { setUseCoworkPlugins } from '../../bootstrap/state.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
  logEvent,
} from '../../services/analytics/index.js'
import {
  disableAllPlugins,
  disablePlugin,
  enablePlugin,
  installPlugin,
  uninstallPlugin,
  updatePluginCli,
  VALID_INSTALLABLE_SCOPES,
  VALID_UPDATE_SCOPES,
} from '../../services/plugins/pluginCliCommands.js'
import { getPluginErrorMessage } from '../../types/plugin.js'
import { errorMessage } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import { clearAllCaches } from '../../utils/plugins/cacheUtils.js'
import { getInstallCounts } from '../../utils/plugins/installCounts.js'
import { getPluginDataDirSize } from '../../utils/plugins/pluginDirectories.js'
import { getPluginStorageId, loadPluginOptions, savePluginOptions } from '../../utils/plugins/pluginOptionsStorage.js'
import { PluginCliConfigError, readPluginConfigStdin, validatePluginCliValues } from '../../utils/plugins/pluginCliConfig.js'
import {
  isPluginInstalled,
  loadInstalledPluginsV2,
} from '../../utils/plugins/installedPluginsManager.js'
import {
  createPluginId,
  loadMarketplacesWithGracefulDegradation,
} from '../../utils/plugins/marketplaceHelpers.js'
import {
  addMarketplaceSource,
  loadKnownMarketplacesConfig,
  refreshAllMarketplaces,
  refreshMarketplace,
  removeMarketplaceSource,
  saveMarketplaceToSettings,
} from '../../utils/plugins/marketplaceManager.js'
import { loadPluginMcpServers } from '../../utils/plugins/mcpPluginIntegration.js'
import { parseMarketplaceInput } from '../../utils/plugins/parseMarketplaceInput.js'
import {
  parsePluginIdentifier,
  scopeToSettingSource,
} from '../../utils/plugins/pluginIdentifier.js'
import { loadAllPlugins } from '../../utils/plugins/pluginLoader.js'
import type { PluginSource } from '../../utils/plugins/schemas.js'
import {
  type ValidationResult,
  validateManifest,
  validatePluginContents,
} from '../../utils/plugins/validatePlugin.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { getSettingsForSource } from '../../utils/settings/settings.js'
import { plural } from '../../utils/stringUtils.js'
import { cliError, cliOk } from '../exit.js'

// Re-export for main.tsx to reference in option definitions
export { VALID_INSTALLABLE_SCOPES, VALID_UPDATE_SCOPES }

/**
 * Helper function to handle marketplace command errors consistently.
 */
export function handleMarketplaceError(error: unknown, action: string): never {
  logError(error)
  cliError(`${figures.cross} Failed to ${action}: ${errorMessage(error)}`)
}

function printValidationResult(result: ValidationResult): void {
  if (result.errors.length > 0) {
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log(
      `${figures.cross} Found ${result.errors.length} ${plural(result.errors.length, 'error')}:\n`,
    )
    result.errors.forEach(error => {
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log(`  ${figures.pointer} ${error.path}: ${error.message}`)
    })
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log('')
  }
  if (result.warnings.length > 0) {
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log(
      `${figures.warning} Found ${result.warnings.length} ${plural(result.warnings.length, 'warning')}:\n`,
    )
    result.warnings.forEach(warning => {
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log(`  ${figures.pointer} ${warning.path}: ${warning.message}`)
    })
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log('')
  }
}

// plugin validate
export async function pluginValidateHandler(
  manifestPath: string,
  options: { cowork?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  try {
    const result = await validateManifest(manifestPath)

    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log(`Validating ${result.fileType} manifest: ${result.filePath}\n`)
    printValidationResult(result)

    // If this is a plugin manifest located inside a .claude-plugin directory,
    // also validate the plugin's content files (skills, agents, commands,
    // hooks). Works whether the user passed a directory or the plugin.json
    // path directly.
    let contentResults: ValidationResult[] = []
    if (result.fileType === 'plugin') {
      const manifestDir = dirname(result.filePath)
      if (basename(manifestDir) === '.claude-plugin') {
        contentResults = await validatePluginContents(dirname(manifestDir))
        for (const r of contentResults) {
          // biome-ignore lint/suspicious/noConsole:: intentional console output
          console.log(`Validating ${r.fileType}: ${r.filePath}\n`)
          printValidationResult(r)
        }
      }
    }

    const allSuccess = result.success && contentResults.every(r => r.success)
    const hasWarnings =
      result.warnings.length > 0 ||
      contentResults.some(r => r.warnings.length > 0)

    if (allSuccess) {
      cliOk(
        hasWarnings
          ? `${figures.tick} Validation passed with warnings`
          : `${figures.tick} Validation passed`,
      )
    } else {
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log(`${figures.cross} Validation failed`)
      process.exit(1)
    }
  } catch (error) {
    logError(error)
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.error(
      `${figures.cross} Unexpected error during validation: ${errorMessage(error)}`,
    )
    process.exit(2)
  }
}

// plugin list (lines 5217–5416)
export async function pluginListHandler(options: {
  json?: boolean
  available?: boolean
  cowork?: boolean
  dataSize?: boolean | string
}): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  logEvent('tengu_plugin_list_command', {})

  const installedData = loadInstalledPluginsV2()
  // Resolve actual enabled state from merged settings. Editable scopes only
  // identify where to write changes, and can disagree with policy or local
  // overrides; the CLI list reports effective runtime state.
  const { checkEnabledPlugins } = await import(
    '../../utils/plugins/pluginStartupCheck.js'
  )
  const enabledPlugins = new Set(await checkEnabledPlugins())

  const pluginIds = Object.keys(installedData.plugins)
  if (options.json && typeof options.dataSize === 'string' &&
      !(installedData.plugins[options.dataSize]?.length > 0)) {
    cliError('--data-size names a plugin that is not installed')
  }

  // Load all plugins once. The JSON and human paths both need:
  //  - loadErrors (to show load failures per plugin)
  //  - inline plugins (session-only via --plugin-dir, source='name@inline')
  //    which are NOT in installedData.plugins (V2 bookkeeping) — they must
  //    be surfaced separately or `plugin list` silently ignores --plugin-dir.
  const {
    enabled: loadedEnabled,
    disabled: loadedDisabled,
    errors: loadErrors,
  } = await loadAllPlugins()
  const allLoadedPlugins = [...loadedEnabled, ...loadedDisabled]
  const inlinePlugins = allLoadedPlugins.filter(p =>
    p.source.endsWith('@inline'),
  )
  const skillsDirPlugins = allLoadedPlugins.filter(p =>
    p.source.endsWith('@skills-dir'),
  )
  const skillsDirLoadErrors = loadErrors.filter(e =>
    e.source.endsWith('@skills-dir'),
  )
  // Path-level inline failures (dir doesn't exist, parse error before
  // manifest is read) use source='inline[N]'. Plugin-level errors after
  // manifest read use source='name@inline'. Collect both for the session
  // section — these are otherwise invisible since they have no pluginId.
  const inlineLoadErrors = loadErrors.filter(
    e => e.source.endsWith('@inline') || e.source.startsWith('inline['),
  )

  if (options.json) {
    // Create a map of plugin source to loaded plugin for quick lookup
    const loadedPluginMap = new Map(allLoadedPlugins.map(p => [p.source, p]))

    const plugins: Array<{
      id: string
      version: string
      scope: string
      enabled: boolean
      projectEnabled?: boolean
      installPath: string
      installedAt?: string
      lastUpdated?: string
      projectPath?: string
      mcpServers?: Record<string, unknown>
      errors?: string[]
      dataDirSize?: { bytes: number; human: string }
      dataDirUnreadable?: boolean
      errorDetails?: Array<{ type: string; path: string }>
    }> = []

    for (const pluginId of pluginIds.sort()) {
      const installations = installedData.plugins[pluginId]
      if (!installations || installations.length === 0) continue

      // Find loading errors for this plugin
      const pluginName = parsePluginIdentifier(pluginId).name
      const pluginErrors = loadErrors
        .filter(
          e =>
            e.source === pluginId || ('plugin' in e && e.plugin === pluginName),
        )
        .map(getPluginErrorMessage)

      let dataDirSize: { bytes: number; human: string } | undefined
      let dataDirUnreadable = false
      if (options.dataSize === true || options.dataSize === pluginId) {
        try {
          dataDirSize = await getPluginDataDirSize(pluginId, { throwIfUnreadable: true }) ?? undefined
        } catch {
          dataDirUnreadable = true
        }
      }

      for (const installation of installations) {
        // Try to find the loaded plugin to get MCP servers
        const loadedPlugin = loadedPluginMap.get(pluginId)
        let mcpServers: Record<string, unknown> | undefined

        if (loadedPlugin) {
          // Load MCP servers if not already cached
          const servers =
            loadedPlugin.mcpServers ||
            (await loadPluginMcpServers(loadedPlugin))
          if (servers && Object.keys(servers).length > 0) {
            mcpServers = servers
          }
        }

        plugins.push({
          id: pluginId,
          version: installation.version || 'unknown',
          scope: installation.scope,
          enabled: enabledPlugins.has(pluginId),
          projectEnabled: getSettingsForSource('projectSettings')?.enabledPlugins?.[pluginId] === true,
          installPath: installation.installPath,
          installedAt: installation.installedAt,
          lastUpdated: installation.lastUpdated,
          projectPath: installation.projectPath,
          mcpServers,
          errors: pluginErrors.length > 0 ? pluginErrors : undefined,
          dataDirSize,
          dataDirUnreadable: dataDirUnreadable || undefined,
        })
      }
    }

    // Session-only plugins: scope='session', no install metadata.
    // Filter from inlineLoadErrors (not loadErrors) so an installed plugin
    // with the same manifest name doesn't cross-contaminate via e.plugin.
    // The e.plugin fallback catches the dirName≠manifestName case:
    // createPluginFromPath tags errors with `${dirName}@inline` but
    // plugin.source is reassigned to `${manifest.name}@inline` afterward
    // (pluginLoader.ts loadInlinePlugins), so e.source !== p.source when
    // a dev checkout dir like ~/code/my-fork/ has manifest name 'cool-plugin'.
    for (const p of inlinePlugins) {
      const servers = p.mcpServers || (await loadPluginMcpServers(p))
      const pErrors = inlineLoadErrors
        .filter(
          e => e.source === p.source || ('plugin' in e && e.plugin === p.name),
        )
        .map(getPluginErrorMessage)
      plugins.push({
        id: p.source,
        version: p.manifest.version ?? 'unknown',
        scope: 'session',
        enabled: p.enabled !== false,
        projectEnabled: getSettingsForSource('projectSettings')?.enabledPlugins?.[p.source] === true,
        installPath: p.path,
        mcpServers:
          servers && Object.keys(servers).length > 0 ? servers : undefined,
        errors: pErrors.length > 0 ? pErrors : undefined,
      })
    }
    // Standalone manifests under ~/.claude/skills are user-scoped native
    // plugins. They do not appear in installed_plugins.json's V2 registry.
    for (const p of skillsDirPlugins) {
      plugins.push({
        id: p.source,
        version: p.manifest.version ?? 'unknown',
        scope: 'user',
        enabled: p.enabled !== false,
        installPath: p.path,
      })
    }
    // A malformed skills-directory manifest has no LoadedPlugin, but still
    // appears as a failed user-scoped plugin in the official JSON listing.
    for (const error of skillsDirLoadErrors.filter(error =>
      !skillsDirPlugins.some(plugin => error.source === plugin.source))) {
      const errorPath = 'manifestPath' in error ? error.manifestPath :
        'path' in error ? error.path : ''
      plugins.push({
        id: error.source,
        version: 'unknown',
        scope: 'user',
        enabled: false,
        installPath: '',
        errors: [getPluginErrorMessage(error)],
        errorDetails: [{ type: error.type, path: errorPath }],
      })
    }

    // Path-level inline failures (--plugin-dir /nonexistent): no LoadedPlugin
    // exists so the loop above can't surface them. Mirror the human-path
    // handling so JSON consumers see the failure instead of silent omission.
    for (const e of inlineLoadErrors.filter(e =>
      e.source.startsWith('inline['),
    )) {
      plugins.push({
        id: e.source,
        version: 'unknown',
        scope: 'session',
        enabled: false,
        projectEnabled: false,
        installPath: 'path' in e ? e.path : '',
        errors: [getPluginErrorMessage(e)],
      })
    }

    // If --available is set, also load available plugins from marketplaces
    if (options.available) {
      const available: Array<{
        pluginId: string
        name: string
        description?: string
        marketplaceName: string
        version?: string
        source: PluginSource
        installCount?: number
      }> = []

      try {
        const [config, installCounts] = await Promise.all([
          loadKnownMarketplacesConfig(),
          getInstallCounts(),
        ])
        const { marketplaces } =
          await loadMarketplacesWithGracefulDegradation(config)

        for (const {
          name: marketplaceName,
          data: marketplace,
        } of marketplaces) {
          if (marketplace) {
            for (const entry of marketplace.plugins) {
              const pluginId = createPluginId(entry.name, marketplaceName)
              // Only include plugins that are not already installed
              if (!isPluginInstalled(pluginId)) {
                available.push({
                  pluginId,
                  name: entry.name,
                  description: entry.description,
                  marketplaceName,
                  version: entry.version,
                  source: entry.source,
                  installCount: installCounts?.get(pluginId),
                })
              }
            }
          }
        }
      } catch (error) {
        // --available must not report a complete but empty marketplace list
        // when loading the underlying source failed.
        cliError(`Unable to enumerate available marketplace plugins: ${errorMessage(error)}`)
      }

      cliOk(jsonStringify({ installed: plugins, available }, null, 2))
    } else {
      cliOk(jsonStringify(plugins, null, 2))
    }
  }

  if (pluginIds.length === 0 && inlinePlugins.length === 0 && skillsDirPlugins.length === 0) {
    // inlineLoadErrors can exist with zero inline plugins (e.g. --plugin-dir
    // points at a nonexistent path). Don't early-exit over them — fall
    // through to the session section so the failure is visible.
    if (inlineLoadErrors.length === 0 && skillsDirLoadErrors.length === 0) {
      cliOk(
        'No plugins installed. Use `claude plugin install` to install a plugin.',
      )
    }
  }

  if (pluginIds.length > 0) {
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log('Installed plugins:\n')
  }

  for (const pluginId of pluginIds.sort()) {
    const installations = installedData.plugins[pluginId]
    if (!installations || installations.length === 0) continue

    // Find loading errors for this plugin
    const pluginName = parsePluginIdentifier(pluginId).name
    const pluginErrors = loadErrors.filter(
      e => e.source === pluginId || ('plugin' in e && e.plugin === pluginName),
    )

    for (const installation of installations) {
      const isEnabled = enabledPlugins.has(pluginId)
      const status =
        pluginErrors.length > 0
          ? `${figures.cross} failed to load`
          : isEnabled
            ? `${figures.tick} enabled`
            : `${figures.cross} disabled`
      const version = installation.version || 'unknown'
      const scope = installation.scope

      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log(`  ${figures.pointer} ${pluginId}`)
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log(`    Version: ${version}`)
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log(`    Scope: ${scope}`)
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log(`    Status: ${status}`)
      for (const error of pluginErrors) {
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(`    Error: ${getPluginErrorMessage(error)}`)
      }
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log('')
    }
  }

  if (skillsDirPlugins.length > 0 || skillsDirLoadErrors.length > 0) {
    console.log('Skills-directory plugins (.claude/skills/*):\n')
    for (const p of skillsDirPlugins) {
      const errors = skillsDirLoadErrors.filter(e =>
        e.source === p.source || ('plugin' in e && e.plugin === p.name))
      const status = errors.length > 0
        ? figures.cross + ' loaded with errors'
        : p.enabled !== false ? figures.tick + ' loaded' : figures.cross + ' disabled'
      console.log('  ' + figures.pointer + ' ' + p.source)
      console.log('    Version: ' + (p.manifest.version ?? 'unknown'))
      console.log('    Scope: user')
      console.log('    Path: ' + p.path)
      console.log('    Status: ' + status)
      for (const error of errors) console.log('    Error: ' + getPluginErrorMessage(error))
      console.log('')
    }
    for (const error of skillsDirLoadErrors.filter(e =>
      !skillsDirPlugins.some(p => e.source === p.source))) {
      console.log('  ' + figures.pointer + ' ' + error.source + ': ' +
        figures.cross + ' ' + getPluginErrorMessage(error) + '\n')
    }
  }

  if (inlinePlugins.length > 0 || inlineLoadErrors.length > 0) {
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log('Session-only plugins (--plugin-dir):\n')
    for (const p of inlinePlugins) {
      // Same dirName≠manifestName fallback as the JSON path above — error
      // sources use the dir basename but p.source uses the manifest name.
      const pErrors = inlineLoadErrors.filter(
        e => e.source === p.source || ('plugin' in e && e.plugin === p.name),
      )
      const status =
        pErrors.length > 0
          ? `${figures.cross} loaded with errors`
          : `${figures.tick} loaded`
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log(`  ${figures.pointer} ${p.source}`)
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log(`    Version: ${p.manifest.version ?? 'unknown'}`)
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log(`    Path: ${p.path}`)
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log(`    Status: ${status}`)
      for (const e of pErrors) {
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(`    Error: ${getPluginErrorMessage(e)}`)
      }
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log('')
    }
    // Path-level failures: no LoadedPlugin object exists. Show them so
    // `--plugin-dir /typo` doesn't just silently produce nothing.
    for (const e of inlineLoadErrors.filter(e =>
      e.source.startsWith('inline['),
    )) {
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log(
        `  ${figures.pointer} ${e.source}: ${figures.cross} ${getPluginErrorMessage(e)}\n`,
      )
    }
  }

  cliOk()
}

// marketplace add (lines 5433–5487)
export async function marketplaceAddHandler(
  source: string,
  options: { cowork?: boolean; claudeai?: boolean; sparse?: string[]; scope?: string; json?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  // A claude.ai-hosted marketplace is attached to an account and must never
  // be written to local/project settings as an arbitrary Git/URL source.
  // The 317 public CLI refuses this route when the host catalog is absent.
  if (options.claudeai) {
    if (options.sparse !== undefined || options.scope !== undefined) {
      cliError(`${figures.cross} --claudeai takes only the marketplace name (no --sparse or --scope: a claude.ai marketplace is hosted for your account, not declared in settings)`)
    }
    console.log('Adding marketplace…')
    cliError(`${figures.cross} Failed to add marketplace: claude.ai marketplaces are not available here — sign in to claude.ai (claude /login) with plugin sync on, then run: claude plugin marketplace list`)
  }
  try {
    const parsed = await parseMarketplaceInput(source)

    if (!parsed) {
      cliError(
        `${figures.cross} Invalid marketplace source format. Try: owner/repo, https://..., or ./path`,
      )
    }

    if ('error' in parsed) {
      cliError(`${figures.cross} ${parsed.error}`)
    }

    // Validate scope
    const scope = options.scope ?? 'user'
    if (scope !== 'user' && scope !== 'project' && scope !== 'local') {
      cliError(
        `${figures.cross} Invalid scope '${scope}'. Use: user, project, or local`,
      )
    }
    const settingSource = scopeToSettingSource(scope)

    let marketplaceSource = parsed

    if (options.sparse && options.sparse.length > 0) {
      if (
        marketplaceSource.source === 'github' ||
        marketplaceSource.source === 'git'
      ) {
        marketplaceSource = {
          ...marketplaceSource,
          sparsePaths: options.sparse,
        }
      } else {
        cliError(
          `${figures.cross} --sparse is only supported for github and git marketplace sources (got: ${marketplaceSource.source})`,
        )
      }
    }

    // biome-ignore lint/suspicious/noConsole:: intentional console output
    if (!options.json) console.log('Adding marketplace...')

    const { name, alreadyMaterialized, resolvedSource } =
      await addMarketplaceSource(marketplaceSource, message => {
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        if (!options.json) console.log(message)
      })

    // Write intent to settings at the requested scope
    saveMarketplaceToSettings(name, { source: resolvedSource }, settingSource)

    clearAllCaches()

    let sourceType = marketplaceSource.source
    if (marketplaceSource.source === 'github') {
      sourceType =
        marketplaceSource.repo as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
    }
    logEvent('tengu_marketplace_added', {
      source_type:
        sourceType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    const message = alreadyMaterialized
      ? `Marketplace '${name}' already on disk — declared in ${scope} settings`
      : `Successfully added marketplace: ${name} (declared in ${scope} settings)`
    if (options.json) {
      cliOk(jsonStringify({ command: 'marketplace-add', outcome: 'ok', marketplace: name, message }))
    } else {
      cliOk(`${figures.tick} ${message}`)
    }
  } catch (error) {
    handleMarketplaceError(error, 'add marketplace')
  }
}

// marketplace list (lines 5497–5565)
export async function marketplaceListHandler(options: {
  json?: boolean
  cowork?: boolean
}): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  try {
    const config = await loadKnownMarketplacesConfig()
    const names = Object.keys(config)

    if (options.json) {
      const marketplaces = names.sort().map(name => {
        const marketplace = config[name]
        const source = marketplace?.source
        return {
          name,
          source: source?.source,
          ...(source?.source === 'github' && { repo: source.repo }),
          ...(source?.source === 'git' && { url: source.url }),
          ...(source?.source === 'url' && { url: source.url }),
          ...(source?.source === 'directory' && { path: source.path }),
          ...(source?.source === 'file' && { path: source.path }),
          installLocation: marketplace?.installLocation,
        }
      })
      cliOk(jsonStringify(marketplaces, null, 2))
    }

    if (names.length === 0) {
      cliOk('No marketplaces configured')
    }

    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log('Configured marketplaces:\n')
    names.forEach(name => {
      const marketplace = config[name]
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log(`  ${figures.pointer} ${name}`)

      if (marketplace?.source) {
        const src = marketplace.source
        if (src.source === 'github') {
          // biome-ignore lint/suspicious/noConsole:: intentional console output
          console.log(`    Source: GitHub (${src.repo})`)
        } else if (src.source === 'git') {
          // biome-ignore lint/suspicious/noConsole:: intentional console output
          console.log(`    Source: Git (${src.url})`)
        } else if (src.source === 'url') {
          // biome-ignore lint/suspicious/noConsole:: intentional console output
          console.log(`    Source: URL (${src.url})`)
        } else if (src.source === 'directory') {
          // biome-ignore lint/suspicious/noConsole:: intentional console output
          console.log(`    Source: Directory (${src.path})`)
        } else if (src.source === 'file') {
          // biome-ignore lint/suspicious/noConsole:: intentional console output
          console.log(`    Source: File (${src.path})`)
        }
      }
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log('')
    })

    cliOk()
  } catch (error) {
    handleMarketplaceError(error, 'list marketplaces')
  }
}

// marketplace remove (lines 5576–5598)
export async function marketplaceRemoveHandler(
  name: string,
  options: { cowork?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  try {
    await removeMarketplaceSource(name)
    clearAllCaches()

    logEvent('tengu_marketplace_removed', {
      marketplace_name:
        name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    cliOk(`${figures.tick} Successfully removed marketplace: ${name}`)
  } catch (error) {
    handleMarketplaceError(error, 'remove marketplace')
  }
}

// marketplace update (lines 5609–5672)
export async function marketplaceUpdateHandler(
  name: string | undefined,
  options: { cowork?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  try {
    if (name) {
      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log(`Updating marketplace: ${name}...`)

      await refreshMarketplace(name, message => {
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(message)
      })

      clearAllCaches()

      logEvent('tengu_marketplace_updated', {
        marketplace_name:
          name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })

      cliOk(`${figures.tick} Successfully updated marketplace: ${name}`)
    } else {
      const config = await loadKnownMarketplacesConfig()
      const marketplaceNames = Object.keys(config)

      if (marketplaceNames.length === 0) {
        cliOk('No marketplaces configured')
      }

      // biome-ignore lint/suspicious/noConsole:: intentional console output
      console.log(`Updating ${marketplaceNames.length} marketplace(s)...`)

      await refreshAllMarketplaces()
      clearAllCaches()

      logEvent('tengu_marketplace_updated_all', {
        count:
          marketplaceNames.length as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })

      cliOk(
        `${figures.tick} Successfully updated ${marketplaceNames.length} marketplace(s)`,
      )
    }
  } catch (error) {
    handleMarketplaceError(error, 'update marketplace(s)')
  }
}

// plugin install (lines 5690–5721)
export async function pluginInstallHandler(
  plugin: string,
  options: { scope?: string; cowork?: boolean; json?: boolean; marketplace?: string; config?: string[]; registry?: string; yes?: boolean; acceptCommand?: string },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  const scope = options.scope || 'user'
  if (options.cowork && scope !== 'user') {
    cliError('--cowork can only be used with user scope')
  }
  if (
    !VALID_INSTALLABLE_SCOPES.includes(
      scope as (typeof VALID_INSTALLABLE_SCOPES)[number],
    )
  ) {
    cliError(
      `Invalid scope: ${scope}. Must be one of: ${VALID_INSTALLABLE_SCOPES.join(', ')}.`,
    )
  }
  // _PROTO_* routes to PII-tagged plugin_name/marketplace_name BQ columns.
  // Unredacted plugin arg was previously logged to general-access
  // additional_metadata for all users — dropped in favor of the privileged
  // column route. marketplace may be undefined (fires before resolution).
  const { name, marketplace } = parsePluginIdentifier(plugin)
  logEvent('tengu_plugin_install_command', {
    _PROTO_plugin_name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    ...(marketplace && {
      _PROTO_marketplace_name:
        marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    }),
    scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  let installId = plugin
  if (options.marketplace) {
    if (plugin.includes('@')) {
      cliError('--marketplace expects a bare plugin name without @marketplace')
    }
    try {
      const parsed = await parseMarketplaceInput(options.marketplace)
      if (!parsed) {
        throw new Error('Invalid marketplace source')
      }
      if ('error' in parsed) {
        throw new Error(parsed.error)
      }
      const added = await addMarketplaceSource(parsed)
      saveMarketplaceToSettings(added.name, { source: added.resolvedSource }, 'userSettings')
      clearAllCaches()
      installId = `${plugin}@${added.name}`
    } catch (error) {
      if (options.json) {
        process.stdout.write(jsonStringify({
          command: 'install',
          outcome: 'failed',
          plugin,
          scope,
          message: errorMessage(error),
          failureCode: 'marketplace_error',
        }) + '\n')
      }
      cliError(`Failed to add marketplace: ${errorMessage(error)}`)
    }
  }
  await installPlugin(installId, scope as 'user' | 'project' | 'local', options.json, options.config, options.registry, {
    yes: options.yes,
    acceptCommand: options.acceptCommand,
  })
}

/** Official 2.1.317 plugin configure: inspect top-level schema or save JSON stdin. */
export async function pluginConfigureHandler(
  pluginId: string,
  options: { cowork?: boolean; json?: boolean; valuesStdin?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  const loaded = await loadAllPlugins()
  const plugin = [...loaded.enabled, ...loaded.disabled].find(p => p.source === pluginId)
  if (!plugin) {
    cliError(`No installed plugin has the id "${pluginId}". Use its full id (name@marketplace), as \`claude plugin list\` shows it.`)
  }
  const id = getPluginStorageId(plugin)
  const schema = plugin.manifest.userConfig ?? {}
  const displayName = plugin.name
  const stored = loadPluginOptions(id)
  // CLI configuration reports every unset option, including optional fields.
  // The interactive plugin enable flow uses getUnconfiguredOptions for a
  // different purpose: prompting only for missing *required* values.
  const getUnsetOptionNames = (values: Record<string, unknown>): string[] =>
    Object.keys(schema).filter(name => values[name] === undefined || values[name] === null || values[name] === '')
  if (options.valuesStdin) {
    if (process.stdin.isTTY) {
      cliError('No option values were piped in. Example: claude plugin configure <plugin> --values-stdin < values.json')
    }
    let normalized
    try {
      const supplied = await readPluginConfigStdin(process.stdin)
      normalized = validatePluginCliValues(supplied, schema, stored)
      if (Object.keys(normalized).length) savePluginOptions(id, normalized, schema)
    } catch (error) {
      if (error instanceof PluginCliConfigError) {
        if (options.json) process.stdout.write(jsonStringify({
          pluginId: id, displayName, refused: { option: error.option, message: error.message },
        }) + '\n')
        cliError(`Failed to save configuration: ${error.message}`)
      }
      throw error
    }
    const saved = Object.keys(normalized)
    const unconfigured = getUnsetOptionNames({ ...stored, ...normalized })
    if (options.json) {
      cliOk(jsonStringify({ pluginId: id, displayName, saved, unconfigured }))
    }
    cliOk(saved.length ? 'Configuration saved. Restart Claude Code to apply it.' : 'No configuration changes.')
  }
  const unconfigured = getUnsetOptionNames(stored)
  const configured: string[] = []
  const inputs: Record<string, string> = {}
  for (const [name, field] of Object.entries(schema)) {
    const value = stored[name]
    if (value !== undefined && value !== '') configured.push(name)
    inputs[name] = field.sensitive ? '' : value === undefined ? '' : String(value)
  }
  if (options.json) {
    cliOk(jsonStringify({ pluginId: id, displayName, schema, inputs, choices: {}, configured, unconfigured }, null, 2))
  }
  const lines = Object.entries(schema).map(([name, field]) =>
    `${field.title || name}: ${configured.includes(name) ? 'configured' : 'not configured'}`)
  cliOk(lines.length ? lines.join('\n') : 'This plugin has no configurable options.')
}

// plugin uninstall (lines 5738–5769)
export async function pluginUninstallHandler(
  plugin: string,
  options: { scope?: string; cowork?: boolean; keepData?: boolean; json?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  const scope = options.scope || 'user'
  if (options.cowork && scope !== 'user') {
    cliError('--cowork can only be used with user scope')
  }
  if (
    !VALID_INSTALLABLE_SCOPES.includes(
      scope as (typeof VALID_INSTALLABLE_SCOPES)[number],
    )
  ) {
    cliError(
      `Invalid scope: ${scope}. Must be one of: ${VALID_INSTALLABLE_SCOPES.join(', ')}.`,
    )
  }
  const { name, marketplace } = parsePluginIdentifier(plugin)
  logEvent('tengu_plugin_uninstall_command', {
    _PROTO_plugin_name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    ...(marketplace && {
      _PROTO_marketplace_name:
        marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    }),
    scope: scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  await uninstallPlugin(
    plugin,
    scope as 'user' | 'project' | 'local',
    options.keepData,
    options.json,
  )
}

// plugin enable (lines 5783–5818)
export async function pluginEnableHandler(
  plugin: string,
  options: { scope?: string; cowork?: boolean; json?: boolean },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  let scope: (typeof VALID_INSTALLABLE_SCOPES)[number] | undefined
  if (options.scope) {
    if (
      !VALID_INSTALLABLE_SCOPES.includes(
        options.scope as (typeof VALID_INSTALLABLE_SCOPES)[number],
      )
    ) {
      cliError(
        `Invalid scope "${options.scope}". Valid scopes: ${VALID_INSTALLABLE_SCOPES.join(', ')}`,
      )
    }
    scope = options.scope as (typeof VALID_INSTALLABLE_SCOPES)[number]
  }
  if (options.cowork && scope !== undefined && scope !== 'user') {
    cliError('--cowork can only be used with user scope')
  }

  // --cowork always operates at user scope
  if (options.cowork && scope === undefined) {
    scope = 'user'
  }

  const { name, marketplace } = parsePluginIdentifier(plugin)
  logEvent('tengu_plugin_enable_command', {
    _PROTO_plugin_name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    ...(marketplace && {
      _PROTO_marketplace_name:
        marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    }),
    scope: (scope ??
      'auto') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  await enablePlugin(plugin, scope, options.json === true)
}

// plugin disable (lines 5833–5902)
export async function pluginDisableHandler(
  plugin: string | undefined,
  options: { scope?: string; cowork?: boolean; all?: boolean },
): Promise<void> {
  if (options.all && plugin) {
    cliError('Cannot use --all with a specific plugin')
  }

  if (!options.all && !plugin) {
    cliError('Please specify a plugin name or use --all to disable all plugins')
  }

  if (options.cowork) setUseCoworkPlugins(true)

  if (options.all) {
    if (options.scope) {
      cliError('Cannot use --scope with --all')
    }

    // No _PROTO_plugin_name here — --all disables all plugins.
    // Distinguishable from the specific-plugin branch by plugin_name IS NULL.
    logEvent('tengu_plugin_disable_command', {})

    await disableAllPlugins()
    return
  }

  let scope: (typeof VALID_INSTALLABLE_SCOPES)[number] | undefined
  if (options.scope) {
    if (
      !VALID_INSTALLABLE_SCOPES.includes(
        options.scope as (typeof VALID_INSTALLABLE_SCOPES)[number],
      )
    ) {
      cliError(
        `Invalid scope "${options.scope}". Valid scopes: ${VALID_INSTALLABLE_SCOPES.join(', ')}`,
      )
    }
    scope = options.scope as (typeof VALID_INSTALLABLE_SCOPES)[number]
  }
  if (options.cowork && scope !== undefined && scope !== 'user') {
    cliError('--cowork can only be used with user scope')
  }

  // --cowork always operates at user scope
  if (options.cowork && scope === undefined) {
    scope = 'user'
  }

  const { name, marketplace } = parsePluginIdentifier(plugin!)
  logEvent('tengu_plugin_disable_command', {
    _PROTO_plugin_name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    ...(marketplace && {
      _PROTO_marketplace_name:
        marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    }),
    scope: (scope ??
      'auto') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  await disablePlugin(plugin!, scope)
}

// plugin update (lines 5918–5948)
export async function pluginUpdateHandler(
  plugin: string,
  options: { scope?: string; cowork?: boolean; json?: boolean; yes?: boolean; acceptCommand?: string },
): Promise<void> {
  if (options.cowork) setUseCoworkPlugins(true)
  const { name, marketplace } = parsePluginIdentifier(plugin)
  logEvent('tengu_plugin_update_command', {
    _PROTO_plugin_name: name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    ...(marketplace && {
      _PROTO_marketplace_name:
        marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
    }),
  })

  let scope: (typeof VALID_UPDATE_SCOPES)[number] = 'user'
  if (options.scope) {
    if (
      !VALID_UPDATE_SCOPES.includes(
        options.scope as (typeof VALID_UPDATE_SCOPES)[number],
      )
    ) {
      cliError(
        `Invalid scope "${options.scope}". Valid scopes: ${VALID_UPDATE_SCOPES.join(', ')}`,
      )
    }
    scope = options.scope as (typeof VALID_UPDATE_SCOPES)[number]
  }
  if (options.cowork && scope !== 'user') {
    cliError('--cowork can only be used with user scope')
  }

  await updatePluginCli(plugin, scope, options)
}
