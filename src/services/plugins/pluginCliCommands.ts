/**
 * CLI command wrappers for plugin operations
 *
 * This module provides thin wrappers around the core plugin operations
 * that handle CLI-specific concerns like console output and process exit.
 *
 * For the core operations (without CLI side effects), see pluginOperations.ts
 */
import figures from 'figures'
import { errorMessage } from '../../utils/errors.js'
import { gracefulShutdown } from '../../utils/gracefulShutdown.js'
import { logError } from '../../utils/log.js'
import { getManagedPluginNames } from '../../utils/plugins/managedPlugins.js'
import { validatePluginCliValues } from '../../utils/plugins/pluginCliConfig.js'
import {
  isMcpbSource,
  loadMcpbFile,
  loadMcpServerUserConfig,
  saveMcpServerUserConfig,
  type UserConfigSchema,
} from '../../utils/plugins/mcpbHandler.js'
import { routeInstallConfigAssignments } from '../../utils/plugins/pluginInstallConfigRouting.mjs'
import { loadAllPlugins } from '../../utils/plugins/pluginLoader.js'
import { getPluginStorageId, loadPluginOptions, savePluginOptions } from '../../utils/plugins/pluginOptionsStorage.js'
import { parsePluginIdentifier } from '../../utils/plugins/pluginIdentifier.js'
import type { PluginScope } from '../../utils/plugins/schemas.js'
import { writeToStdout } from '../../utils/process.js'
import {
  buildPluginTelemetryFields,
  classifyPluginCommandError,
} from '../../utils/telemetry/pluginTelemetry.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
  logEvent,
} from '../analytics/index.js'
import {
  disableAllPluginsOp,
  disablePluginOp,
  enablePluginOp,
  type InstallableScope,
  installPluginOp,
  uninstallPluginOp,
  updatePluginOp,
  VALID_INSTALLABLE_SCOPES,
  VALID_UPDATE_SCOPES,
} from './pluginOperations.js'

export { VALID_INSTALLABLE_SCOPES, VALID_UPDATE_SCOPES }

type PluginCliCommand =
  | 'install'
  | 'uninstall'
  | 'enable'
  | 'disable'
  | 'disable-all'
  | 'update'

/**
 * Generic error handler for plugin CLI commands. Emits
 * tengu_plugin_command_failed before exit so dashboards can compute a
 * success rate against the corresponding success events.
 */
function handlePluginCommandError(
  error: unknown,
  command: PluginCliCommand,
  plugin?: string,
): never {
  logError(error)
  const operation = plugin
    ? `${command} plugin "${plugin}"`
    : command === 'disable-all'
      ? 'disable all plugins'
      : `${command} plugins`
  // biome-ignore lint/suspicious/noConsole:: intentional console output
  console.error(
    `${figures.cross} Failed to ${operation}: ${errorMessage(error)}`,
  )
  const telemetryFields = plugin
    ? (() => {
        const { name, marketplace } = parsePluginIdentifier(plugin)
        return {
          _PROTO_plugin_name:
            name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
          ...(marketplace && {
            _PROTO_marketplace_name:
              marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
          }),
          ...buildPluginTelemetryFields(
            name,
            marketplace,
            getManagedPluginNames(),
          ),
        }
      })()
    : {}
  logEvent('tengu_plugin_command_failed', {
    command:
      command as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    error_category: classifyPluginCommandError(
      error,
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    ...telemetryFields,
  })
  // eslint-disable-next-line custom-rules/no-process-exit
  process.exit(1)
}

/**
 * Save --config after installation, using the same validators and secure
 * storage as the interactive plugin configuration flow. Invalid input is
 * reported without removing an installed plugin or changing stored values.
 */
async function applyInstallConfig(
  pluginId: string,
  assignments: string[],
): Promise<{ applied: boolean; warning?: string }> {
  try {
  const loaded = await loadAllPlugins()
  const installed = [...loaded.enabled, ...loaded.disabled].find(
    entry => entry.source === pluginId || entry.repository === pluginId,
  )
  if (!installed) {
    throw new Error(`--config was given but plugin "${pluginId}" failed to load after install`)
  }
  const storageId = getPluginStorageId(installed)
  const topSchema = installed.manifest.userConfig ?? {}
  const serverSchemas: Record<string, UserConfigSchema> = {}

  // Channel manifests and .mcpb bundles both provide per-server schemas.
  for (const channel of installed.manifest.channels ?? []) {
    if (channel.userConfig && Object.keys(channel.userConfig).length > 0) {
      serverSchemas[channel.server] = channel.userConfig
    }
  }
  const specs = installed.manifest.mcpServers
  const sources = typeof specs === 'string'
    ? [specs]
    : Array.isArray(specs)
      ? specs.filter((source): source is string => typeof source === 'string')
      : []
  for (const source of sources) {
    if (!isMcpbSource(source)) continue
    const bundle = await loadMcpbFile(source, installed.path, storageId, undefined, undefined, true)
    if (bundle.manifest.user_config && Object.keys(bundle.manifest.user_config).length > 0) {
      if (serverSchemas[bundle.manifest.name]) {
        throw new Error(`Duplicate bundled MCP server configuration name: ${bundle.manifest.name}`)
      }
      serverSchemas[bundle.manifest.name] = bundle.manifest.user_config
    }
  }
  const routed = routeInstallConfigAssignments(assignments, topSchema, serverSchemas)
  // Validate ALL inputs before performing any persistent write.
  const topValidated = validatePluginCliValues(
    routed.topLevel, topSchema, loadPluginOptions(storageId),
  )
  const validatedServers = Object.entries(routed.servers).map(([server, values]) => ({
    server,
    schema: serverSchemas[server]!,
    values: validatePluginCliValues(
      values, serverSchemas[server]!, loadMcpServerUserConfig(storageId, server) ?? {},
    ),
  }))
  if (Object.keys(topValidated).length > 0) {
    savePluginOptions(storageId, topValidated, topSchema)
  }
  for (const server of validatedServers) {
    saveMcpServerUserConfig(storageId, server.server, server.values, server.schema)
  }
  return { applied: true }
  } catch (error) {
    return { applied: false, warning: errorMessage(error) }
  }
}

/**
 * CLI command: Install a plugin non-interactively
 * @param plugin Plugin identifier (name or plugin@marketplace)
 * @param scope Installation scope: user, project, or local (defaults to 'user')
 */
export async function installPlugin(
  plugin: string,
  scope: InstallableScope = 'user',
  json = false,
  configEntries: string[] = [],
  npmRegistry?: string,
): Promise<void> {
  try {
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    if (!json) console.log(`Installing plugin "${plugin}"...`)

    const result = await installPluginOp(plugin, scope, npmRegistry)

    if (!result.success) {
      throw new Error(result.message)
    }

    const configStatus = configEntries.length > 0
      ? await applyInstallConfig(result.pluginId ?? plugin, configEntries)
      : undefined
    const configMessage = configStatus?.warning
      ? `${result.message}\n⚠ Installed, but --config not applied: ${configStatus.warning}`
      : result.message

    // biome-ignore lint/suspicious/noConsole:: intentional console output
    if (json) {
      writeToStdout(`${JSON.stringify({
        command: 'install',
        outcome: 'ok',
        plugin,
        pluginId: result.pluginId ?? plugin,
        scope: result.scope ?? scope,
        message: configMessage,
        ...(configStatus && { configApplied: configStatus.applied }),
        ...(result.installedVersion && { installedVersion: result.installedVersion }),
        ...(result.availableVersion && { availableVersion: result.availableVersion }),
      })}\n`)
    } else {
      console.log(`${figures.tick} ${configMessage}`)
    }

    // _PROTO_* routes to PII-tagged plugin_name/marketplace_name BQ columns.
    // Unredacted plugin_id was previously logged to general-access
    // additional_metadata for all users — dropped in favor of the privileged
    // column route.
    const { name, marketplace } = parsePluginIdentifier(
      result.pluginId || plugin,
    )
    logEvent('tengu_plugin_installed_cli', {
      _PROTO_plugin_name:
        name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      ...(marketplace && {
        _PROTO_marketplace_name:
          marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      }),
      scope: (result.scope ||
        scope) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      install_source:
        'cli-explicit' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...buildPluginTelemetryFields(name, marketplace, getManagedPluginNames()),
    })

    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(0)
  } catch (error) {
    if (json) {
      const category = classifyPluginCommandError(error)
      writeToStdout(`${JSON.stringify({
        command: 'install',
        outcome: 'failed',
        plugin,
        scope,
        message: errorMessage(error),
        failureCode: category === 'not-found' ? 'not_found' : category,
      })}\n`)
    }
    handlePluginCommandError(error, 'install', plugin)
  }
}

/**
 * CLI command: Uninstall a plugin non-interactively
 * @param plugin Plugin name or plugin@marketplace identifier
 * @param scope Uninstall from scope: user, project, or local (defaults to 'user')
 */
export async function uninstallPlugin(
  plugin: string,
  scope: InstallableScope = 'user',
  keepData = false,
): Promise<void> {
  try {
    const result = await uninstallPluginOp(plugin, scope, !keepData)

    if (!result.success) {
      throw new Error(result.message)
    }

    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log(`${figures.tick} ${result.message}`)

    const { name, marketplace } = parsePluginIdentifier(
      result.pluginId || plugin,
    )
    logEvent('tengu_plugin_uninstalled_cli', {
      _PROTO_plugin_name:
        name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      ...(marketplace && {
        _PROTO_marketplace_name:
          marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      }),
      scope: (result.scope ||
        scope) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...buildPluginTelemetryFields(name, marketplace, getManagedPluginNames()),
    })

    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(0)
  } catch (error) {
    handlePluginCommandError(error, 'uninstall', plugin)
  }
}

/**
 * CLI command: Enable a plugin non-interactively
 * @param plugin Plugin name or plugin@marketplace identifier
 * @param scope Optional scope. If not provided, finds the most specific scope for the current project.
 */
export async function enablePlugin(
  plugin: string,
  scope?: InstallableScope,
  json = false,
): Promise<void> {
  try {
    const result = await enablePluginOp(plugin, scope)

    if (!result.success) {
      throw new Error(result.message)
    }

    if (json) {
      writeToStdout(`${JSON.stringify({
        command: 'enable',
        outcome: 'ok',
        plugin,
        pluginId: result.pluginId ?? plugin,
        scope: result.scope ?? scope ?? 'user',
        message: result.message,
      })}\n`)
    } else {
      console.log(`${figures.tick} ${result.message}`)
    }

    const { name, marketplace } = parsePluginIdentifier(
      result.pluginId || plugin,
    )
    logEvent('tengu_plugin_enabled_cli', {
      _PROTO_plugin_name:
        name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      ...(marketplace && {
        _PROTO_marketplace_name:
          marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      }),
      scope:
        result.scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...buildPluginTelemetryFields(name, marketplace, getManagedPluginNames()),
    })

    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(0)
  } catch (error) {
    if (json) {
      const message = errorMessage(error)
      writeToStdout(`${JSON.stringify({
        command: 'enable',
        outcome: 'failed',
        plugin,
        message,
        failureCode: message.includes('Use plugin@marketplace format.')
          ? 'ambiguous_marketplace'
          : classifyPluginCommandError(error).replaceAll('-', '_'),
      })}\n`)
    }
    handlePluginCommandError(error, 'enable', plugin)
  }
}

/**
 * CLI command: Disable a plugin non-interactively
 * @param plugin Plugin name or plugin@marketplace identifier
 * @param scope Optional scope. If not provided, finds the most specific scope for the current project.
 */
export async function disablePlugin(
  plugin: string,
  scope?: InstallableScope,
): Promise<void> {
  try {
    const result = await disablePluginOp(plugin, scope)

    if (!result.success) {
      throw new Error(result.message)
    }

    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log(`${figures.tick} ${result.message}`)

    const { name, marketplace } = parsePluginIdentifier(
      result.pluginId || plugin,
    )
    logEvent('tengu_plugin_disabled_cli', {
      _PROTO_plugin_name:
        name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      ...(marketplace && {
        _PROTO_marketplace_name:
          marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
      }),
      scope:
        result.scope as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...buildPluginTelemetryFields(name, marketplace, getManagedPluginNames()),
    })

    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(0)
  } catch (error) {
    handlePluginCommandError(error, 'disable', plugin)
  }
}

/**
 * CLI command: Disable all enabled plugins non-interactively
 */
export async function disableAllPlugins(): Promise<void> {
  try {
    const result = await disableAllPluginsOp()

    if (!result.success) {
      throw new Error(result.message)
    }

    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.log(`${figures.tick} ${result.message}`)

    logEvent('tengu_plugin_disabled_all_cli', {})

    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(0)
  } catch (error) {
    handlePluginCommandError(error, 'disable-all')
  }
}

/**
 * CLI command: Update a plugin non-interactively
 * @param plugin Plugin name or plugin@marketplace identifier
 * @param scope Scope to update
 */
export async function updatePluginCli(
  plugin: string,
  scope: PluginScope,
): Promise<void> {
  try {
    writeToStdout(
      `Checking for updates for plugin "${plugin}" at ${scope} scope…\n`,
    )

    const result = await updatePluginOp(plugin, scope)

    if (!result.success) {
      throw new Error(result.message)
    }

    writeToStdout(`${figures.tick} ${result.message}\n`)

    if (!result.alreadyUpToDate) {
      const { name, marketplace } = parsePluginIdentifier(
        result.pluginId || plugin,
      )
      logEvent('tengu_plugin_updated_cli', {
        _PROTO_plugin_name:
          name as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
        ...(marketplace && {
          _PROTO_marketplace_name:
            marketplace as AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED,
        }),
        old_version: (result.oldVersion ||
          'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        new_version: (result.newVersion ||
          'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ...buildPluginTelemetryFields(
          name,
          marketplace,
          getManagedPluginNames(),
        ),
      })
    }

    await gracefulShutdown(0)
  } catch (error) {
    handlePluginCommandError(error, 'update', plugin)
  }
}
