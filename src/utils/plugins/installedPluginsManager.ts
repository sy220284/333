/**
 * Manages plugin installation metadata stored in installed_plugins.json
 *
 * This module separates plugin installation state (global) from enabled/disabled
 * state (per-repository). The installed_plugins.json file tracks:
 * - Which plugins are installed globally
 * - Installation metadata (version, timestamps, paths)
 *
 * The enabled/disabled state remains in .claude/settings.json for per-repo control.
 *
 * Rationale: Installation is global (a plugin is either on disk or not), while
 * enabled/disabled state is per-repository (different projects may want different
 * plugins active).
 */

import { dirname, join } from 'path'
import { logForDebugging } from '../debug.js'
import { errorMessage, isENOENT, toError } from '../errors.js'
import { getFsImplementation } from '../fsOperations.js'
import { logError } from '../log.js'
import {
  jsonParse,
  jsonStringify,
  writeFileSync_DEPRECATED,
} from '../slowOperations.js'
import { getPluginsDirectory } from './pluginDirectories.js'
import {
  type InstalledPlugin,
  InstalledPluginsFileSchemaV2,
  type InstalledPluginsFileV2,
  type PluginInstallationEntry,
  type PluginScope,
} from './schemas.js'

// Type for persistable scopes (excludes 'flag' which is session-only)
export type PersistableScope = Exclude<PluginScope, never> // All scopes are persistable in the schema

import { getOriginalCwd } from '../../bootstrap/state.js'
import { getHeadForDir } from '../git/gitFilesystem.js'
import { getInitialSettings } from '../settings/settings.js'
import { getPluginCachePath, getVersionedCachePath } from './pluginLoader.js'
import {
  migrateInstalledPluginsRecords,
  normalizeInstalledPluginsRecords,
} from './installedPluginsMigration.mjs'

let initializationPromise: Promise<void> | null = null
let installedPluginsMigrationChecked = false

/**
 * Memoized cache of installed plugins data (V2 format)
 * Cleared by clearInstalledPluginsCache() when file is modified.
 * Prevents repeated filesystem reads within a single CLI session.
 */
let installedPluginsCacheV2: InstalledPluginsFileV2 | null = null

/**
 * Session-level snapshot of installed plugins at startup.
 * This is what the running session uses - it's NOT updated by background operations.
 * Background updates modify the disk file only.
 */
let inMemoryInstalledPlugins: InstalledPluginsFileV2 | null = null

/**
 * Get the path to the installed_plugins.json file
 */
export function getInstalledPluginsFilePath(): string {
  return join(getPluginsDirectory(), 'installed_plugins.json')
}

/**
 * Clear the installed plugins cache
 * Call this when the file is modified to force a reload
 *
 * Note: This also clears the in-memory session state (inMemoryInstalledPlugins).
 * In most cases, this is only called during initialization or testing.
 * For background updates, use updateInstallationPathOnDisk() which preserves
 * the in-memory state.
 */
export function clearInstalledPluginsCache(): void {
  installedPluginsMigrationChecked = false
  installedPluginsCacheV2 = null
  inMemoryInstalledPlugins = null
  logForDebugging('Cleared installed plugins cache')
}

/**
 * Read and validate the current installed_plugins.json schema.
 * Invalid data is an error; only a missing file starts an empty registry.
 */
function ensureInstalledPluginsMigrated(): void {
  if (installedPluginsMigrationChecked) return
  migrateInstalledPluginsRecords(getPluginsDirectory(), getVersionedCachePath)
  installedPluginsMigrationChecked = true
}

function readInstalledPluginsFileRaw(): InstalledPluginsFileV2 | null {
  const fs = getFsImplementation()
  let fileContent: string
  try {
    fileContent = fs.readFileSync(getInstalledPluginsFilePath(), { encoding: 'utf-8' })
  } catch (error) {
    if (isENOENT(error)) return null
    throw error
  }
  return InstalledPluginsFileSchemaV2().parse(
    normalizeInstalledPluginsRecords(jsonParse(fileContent), getVersionedCachePath),
  )
}

/**
 * Load the current versioned plugin registry.
 */
export function loadInstalledPluginsV2(): InstalledPluginsFileV2 {
  if (installedPluginsCacheV2 !== null) return installedPluginsCacheV2
  const data = readInstalledPluginsFileRaw() ?? { version: 2 as const, plugins: {} }
  installedPluginsCacheV2 = data
  return data
}

/**
 * Save installed plugins in V2 format to installed_plugins.json.
 * This is the single source of truth after V1/V2 consolidation.
 */
function saveInstalledPluginsV2(data: InstalledPluginsFileV2): void {
  const fs = getFsImplementation()
  const filePath = getInstalledPluginsFilePath()

  try {
    fs.mkdirSync(getPluginsDirectory())

    const jsonContent = jsonStringify(data, null, 2)
    writeFileSync_DEPRECATED(filePath, jsonContent, {
      encoding: 'utf-8',
      flush: true,
    })

    // Update cache
    installedPluginsCacheV2 = data

    logForDebugging(
      `Saved ${Object.keys(data.plugins).length} installed plugins to ${filePath}`,
    )
  } catch (error) {
    const _errorMsg = errorMessage(error)
    logError(toError(error))
    throw error
  }
}

/**
 * Add or update a plugin installation entry at a specific scope.
 * Used for V2 format where each plugin has an array of installations.
 *
 * @param pluginId - Plugin ID in "plugin@marketplace" format
 * @param scope - Installation scope (managed/user/project/local)
 * @param installPath - Path to versioned plugin directory
 * @param metadata - Additional installation metadata
 * @param projectPath - Project path (required for project/local scopes)
 */
export function addPluginInstallation(
  pluginId: string,
  scope: PersistableScope,
  installPath: string,
  metadata: Partial<PluginInstallationEntry>,
  projectPath?: string,
): void {
  ensureInstalledPluginsMigrated()
  const data = loadInstalledPluginsFromDisk()

  // Get or create array for this plugin
  const installations = data.plugins[pluginId] || []

  // Find existing entry for this scope+projectPath
  const existingIndex = installations.findIndex(
    entry => entry.scope === scope && entry.projectPath === projectPath,
  )

  const newEntry: PluginInstallationEntry = {
    scope,
    installPath,
    version: metadata.version,
    installedAt: metadata.installedAt || new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    gitCommitSha: metadata.gitCommitSha,
    ...(metadata.auto !== undefined && { auto: metadata.auto }),
    ...(projectPath && { projectPath }),
  }

  if (existingIndex >= 0) {
    installations[existingIndex] = newEntry
    logForDebugging(`Updated installation for ${pluginId} at scope ${scope}`)
  } else {
    installations.push(newEntry)
    logForDebugging(`Added installation for ${pluginId} at scope ${scope}`)
  }

  data.plugins[pluginId] = installations
  saveInstalledPluginsV2(data)
}

/**
 * Remove a plugin installation entry from a specific scope.
 *
 * @param pluginId - Plugin ID in "plugin@marketplace" format
 * @param scope - Installation scope to remove
 * @param projectPath - Project path (for project/local scopes)
 */
export function removePluginInstallation(
  pluginId: string,
  scope: PersistableScope,
  projectPath?: string,
): void {
  ensureInstalledPluginsMigrated()
  const data = loadInstalledPluginsFromDisk()
  const installations = data.plugins[pluginId]

  if (!installations) {
    return
  }

  data.plugins[pluginId] = installations.filter(
    entry => !(entry.scope === scope && entry.projectPath === projectPath),
  )

  // Remove plugin entirely if no installations left
  if (data.plugins[pluginId].length === 0) {
    delete data.plugins[pluginId]
  }

  saveInstalledPluginsV2(data)
  logForDebugging(`Removed installation for ${pluginId} at scope ${scope}`)
}

// =============================================================================
// In-Memory vs Disk State Management (for non-in-place updates)
// =============================================================================

/**
 * Get the in-memory installed plugins (session state).
 * This snapshot is loaded at startup and used for the entire session.
 * It is NOT updated by background operations.
 *
 * @returns V2 format data representing the session's view of installed plugins
 */
export function getInMemoryInstalledPlugins(): InstalledPluginsFileV2 {
  if (inMemoryInstalledPlugins === null) {
    inMemoryInstalledPlugins = loadInstalledPluginsV2()
  }
  return inMemoryInstalledPlugins
}

/**
 * Read the current plugin registry directly from disk.
 */
export function loadInstalledPluginsFromDisk(): InstalledPluginsFileV2 {
  return readInstalledPluginsFileRaw() ?? { version: 2, plugins: {} }
}

/**
 * Update a plugin's install path on disk only, without modifying in-memory state.
 * Used by background updater to record new version on disk while session
 * continues using the old version.
 *
 * @param pluginId - Plugin ID in "plugin@marketplace" format
 * @param scope - Installation scope
 * @param projectPath - Project path (for project/local scopes)
 * @param newPath - New install path (to new version directory)
 * @param newVersion - New version string
 */
export function updateInstallationPathOnDisk(
  pluginId: string,
  scope: PersistableScope,
  projectPath: string | undefined,
  newPath: string,
  newVersion: string,
  gitCommitSha?: string,
): void {
  ensureInstalledPluginsMigrated()
  const diskData = loadInstalledPluginsFromDisk()
  const installations = diskData.plugins[pluginId]

  if (!installations) {
    logForDebugging(
      `Cannot update ${pluginId} on disk: plugin not found in installed plugins`,
    )
    return
  }

  const entry = installations.find(
    e => e.scope === scope && e.projectPath === projectPath,
  )

  if (entry) {
    entry.installPath = newPath
    entry.version = newVersion
    entry.lastUpdated = new Date().toISOString()
    if (gitCommitSha !== undefined) {
      entry.gitCommitSha = gitCommitSha
    }

    const filePath = getInstalledPluginsFilePath()

    // Write to single file (V2 format with version=2)
    writeFileSync_DEPRECATED(filePath, jsonStringify(diskData, null, 2), {
      encoding: 'utf-8',
      flush: true,
    })

    // Clear cache since disk changed, but do NOT update inMemoryInstalledPlugins
    installedPluginsCacheV2 = null

    logForDebugging(
      `Updated ${pluginId} on disk to version ${newVersion} at ${newPath}`,
    )
  } else {
    logForDebugging(
      `Cannot update ${pluginId} on disk: no installation for scope ${scope}`,
    )
  }
  // Note: inMemoryInstalledPlugins is NOT updated
}

/**
 * Check if there are pending updates (disk differs from memory).
 * This happens when background updater has downloaded new versions.
 *
 * @returns true if any plugin has a different install path on disk vs memory
 */
export function hasPendingUpdates(): boolean {
  const memoryState = getInMemoryInstalledPlugins()
  const diskState = loadInstalledPluginsFromDisk()

  for (const [pluginId, diskInstallations] of Object.entries(
    diskState.plugins,
  )) {
    const memoryInstallations = memoryState.plugins[pluginId]
    if (!memoryInstallations) continue

    for (const diskEntry of diskInstallations) {
      const memoryEntry = memoryInstallations.find(
        m =>
          m.scope === diskEntry.scope &&
          m.projectPath === diskEntry.projectPath,
      )
      if (memoryEntry && memoryEntry.installPath !== diskEntry.installPath) {
        return true // Disk has different version than memory
      }
    }
  }

  return false
}

/**
 * Get the count of pending updates (installations where disk differs from memory).
 *
 * @returns Number of installations with pending updates
 */
export function getPendingUpdateCount(): number {
  let count = 0
  const memoryState = getInMemoryInstalledPlugins()
  const diskState = loadInstalledPluginsFromDisk()

  for (const [pluginId, diskInstallations] of Object.entries(
    diskState.plugins,
  )) {
    const memoryInstallations = memoryState.plugins[pluginId]
    if (!memoryInstallations) continue

    for (const diskEntry of diskInstallations) {
      const memoryEntry = memoryInstallations.find(
        m =>
          m.scope === diskEntry.scope &&
          m.projectPath === diskEntry.projectPath,
      )
      if (memoryEntry && memoryEntry.installPath !== diskEntry.installPath) {
        count++
      }
    }
  }

  return count
}

/**
 * Get details about pending updates for display.
 *
 * @returns Array of objects with pluginId, scope, oldVersion, newVersion
 */
export function getPendingUpdatesDetails(): Array<{
  pluginId: string
  scope: string
  oldVersion: string
  newVersion: string
}> {
  const updates: Array<{
    pluginId: string
    scope: string
    oldVersion: string
    newVersion: string
  }> = []

  const memoryState = getInMemoryInstalledPlugins()
  const diskState = loadInstalledPluginsFromDisk()

  for (const [pluginId, diskInstallations] of Object.entries(
    diskState.plugins,
  )) {
    const memoryInstallations = memoryState.plugins[pluginId]
    if (!memoryInstallations) continue

    for (const diskEntry of diskInstallations) {
      const memoryEntry = memoryInstallations.find(
        m =>
          m.scope === diskEntry.scope &&
          m.projectPath === diskEntry.projectPath,
      )
      if (memoryEntry && memoryEntry.installPath !== diskEntry.installPath) {
        updates.push({
          pluginId,
          scope: diskEntry.scope,
          oldVersion: memoryEntry.version || 'unknown',
          newVersion: diskEntry.version || 'unknown',
        })
      }
    }
  }

  return updates
}

/**
 * Reset the in-memory session state.
 * This should only be called at startup or for testing.
 */
export function resetInMemoryState(): void {
  inMemoryInstalledPlugins = null
}

/**
 * Initialize the versioned plugins system.
 * This loads the current V2 registry into a per-session snapshot.
 *
 * This should be called early during startup in all modes (REPL and headless).
 *
 * @returns Promise that resolves when initialization is complete
 */
export async function initializeVersionedPlugins(): Promise<void> {
  if (initializationPromise === null) {
    initializationPromise = (async () => {
      // Session startup is read-only: the official 317 plugin list can inspect
      // historical V1 records without modifying the user's registry.
      // Installation and update operations perform the verified V2 migration.
      clearInstalledPluginsCache()
      const data = getInMemoryInstalledPlugins()
      logForDebugging(
        `Initialized versioned plugins system with ${Object.keys(data.plugins).length} plugins`,
      )
    })().catch(error => {
      initializationPromise = null
      throw error
    })
  }
  await initializationPromise
}

/**
 * Remove all plugin entries belonging to a specific marketplace from installed_plugins.json.
 *
 * Loads V2 data once, finds all plugin IDs matching the `@{marketplaceName}` suffix,
 * collects their install paths, removes the entries, and saves once.
 *
 * @param marketplaceName - The marketplace name (matched against `@{name}` suffix)
 * @returns orphanedPaths (for markPluginVersionOrphaned) and removedPluginIds
 *   (for deletePluginOptions) from the removed entries
 */
export function removeAllPluginsForMarketplace(marketplaceName: string): {
  orphanedPaths: string[]
  removedPluginIds: string[]
} {
  if (!marketplaceName) {
    return { orphanedPaths: [], removedPluginIds: [] }
  }

  ensureInstalledPluginsMigrated()
  const data = loadInstalledPluginsFromDisk()
  const suffix = `@${marketplaceName}`
  const orphanedPaths = new Set<string>()
  const removedPluginIds: string[] = []

  for (const pluginId of Object.keys(data.plugins)) {
    if (!pluginId.endsWith(suffix)) {
      continue
    }

    for (const entry of data.plugins[pluginId] ?? []) {
      if (entry.installPath) {
        orphanedPaths.add(entry.installPath)
      }
    }

    delete data.plugins[pluginId]
    removedPluginIds.push(pluginId)
    logForDebugging(
      `Removed installed plugin for marketplace removal: ${pluginId}`,
    )
  }

  if (removedPluginIds.length > 0) {
    saveInstalledPluginsV2(data)
  }

  return { orphanedPaths: Array.from(orphanedPaths), removedPluginIds }
}

/**
 * Predicate: is this installation relevant to the current project context?
 *
 * V2 installed_plugins.json may contain project-scoped entries from OTHER
 * projects (a single user-level file tracks all scopes). Callers asking
 * "is this plugin installed" almost always mean "installed in a way that's
 * active here" — not "installed anywhere on this machine". See #29608:
 * DiscoverPlugins.tsx was hiding plugins that were only installed in an
 * unrelated project.
 *
 * - user/managed scopes: always relevant (global)
 * - project/local scopes: only if projectPath matches the current project
 *
 * getOriginalCwd() (not getCwd()) because "current project" is where Claude
 * Code was launched from, not wherever the working directory has drifted to.
 */
export function isInstallationRelevantToCurrentProject(
  inst: PluginInstallationEntry,
): boolean {
  return (
    inst.scope === 'user' ||
    inst.scope === 'managed' ||
    inst.projectPath === getOriginalCwd()
  )
}

/**
 * Check if a plugin is installed in a way relevant to the current project.
 *
 * @param pluginId - Plugin ID in "plugin@marketplace" format
 * @returns True if the plugin has a user/managed-scoped installation, OR a
 *   project/local-scoped installation whose projectPath matches the current
 *   project. Returns false for plugins only installed in other projects.
 */
export function isPluginInstalled(pluginId: string): boolean {
  const v2Data = loadInstalledPluginsV2()
  const installations = v2Data.plugins[pluginId]
  if (!installations || installations.length === 0) {
    return false
  }
  if (!installations.some(isInstallationRelevantToCurrentProject)) {
    return false
  }
  // Plugins are loaded from settings.enabledPlugins
  // If settings.enabledPlugins and installed_plugins.json diverge
  // (via settings.json clobber), return false
  return getInitialSettings().enabledPlugins?.[pluginId] !== undefined
}

/**
 * True only if the plugin has a USER or MANAGED scope installation.
 *
 * Use this in UI flows that decide whether to offer installation at all.
 * A user/managed-scope install means the plugin is available everywhere —
 * there's nothing the user can add. A project/local-scope install means the
 * user might still want to install at user scope to make it global.
 *
 * gh-29997 / gh-29240 / gh-29392: the browse UI was blocking on
 * isPluginInstalled() which returns true for project-scope installs,
 * preventing users from adding a user-scope entry for the same plugin.
 * The backend (installPluginOp → addInstalledPlugin) already supports
 * multiple scope entries per plugin — only the UI gate was wrong.
 *
 * @param pluginId - Plugin ID in "plugin@marketplace" format
 */
export function isPluginGloballyInstalled(pluginId: string): boolean {
  const v2Data = loadInstalledPluginsV2()
  const installations = v2Data.plugins[pluginId]
  if (!installations || installations.length === 0) {
    return false
  }
  const hasGlobalEntry = installations.some(
    entry => entry.scope === 'user' || entry.scope === 'managed',
  )
  if (!hasGlobalEntry) return false
  // Same settings divergence guard as isPluginInstalled — if enabledPlugins
  // was clobbered, treat as not-installed so the user can re-enable.
  return getInitialSettings().enabledPlugins?.[pluginId] !== undefined
}

/**
 * Add or update a plugin's installation metadata
 *
 * Updates the current V2 registry.
 *
 * @param pluginId - Plugin ID in "plugin@marketplace" format
 * @param metadata - Installation metadata
 * @param scope - Installation scope (defaults to 'user')
 * @param projectPath - Project path (for project/local scopes)
 */
export function addInstalledPlugin(
  pluginId: string,
  metadata: InstalledPlugin,
  scope: PersistableScope = 'user',
  projectPath?: string,
): void {
  ensureInstalledPluginsMigrated()
  const v2Data = loadInstalledPluginsFromDisk()
  const v2Entry: PluginInstallationEntry = {
    scope,
    installPath: metadata.installPath,
    version: metadata.version,
    installedAt: metadata.installedAt,
    lastUpdated: metadata.lastUpdated,
    gitCommitSha: metadata.gitCommitSha,
    ...(projectPath && { projectPath }),
  }

  // Get or create array for this plugin (preserves other scope installations)
  const installations = v2Data.plugins[pluginId] || []

  // Find existing entry for this scope+projectPath
  const existingIndex = installations.findIndex(
    entry => entry.scope === scope && entry.projectPath === projectPath,
  )

  const isUpdate = existingIndex >= 0
  if (isUpdate) {
    installations[existingIndex] = v2Entry
  } else {
    installations.push(v2Entry)
  }

  v2Data.plugins[pluginId] = installations
  saveInstalledPluginsV2(v2Data)

  logForDebugging(
    `${isUpdate ? 'Updated' : 'Added'} installed plugin: ${pluginId} (scope: ${scope})`,
  )
}

/**
 * Remove a plugin from the installed plugins registry
 * This should be called when a plugin is uninstalled.
 *
 * Note: This function only updates the registry file. To fully uninstall,
 * call deletePluginCache() afterward to remove the physical files.
 *
 * @param pluginId - Plugin ID in "plugin@marketplace" format
 * @returns The removed plugin metadata, or undefined if it wasn't installed
 */
export function removeInstalledPlugin(
  pluginId: string,
): InstalledPlugin | undefined {
  ensureInstalledPluginsMigrated()
  const v2Data = loadInstalledPluginsFromDisk()
  const installations = v2Data.plugins[pluginId]

  if (!installations || installations.length === 0) {
    return undefined
  }

  // Preserve the public plugin metadata return shape for uninstall callers
  const firstInstall = installations[0]
  const metadata: InstalledPlugin | undefined = firstInstall
    ? {
        version: firstInstall.version || 'unknown',
        installedAt: firstInstall.installedAt || new Date().toISOString(),
        lastUpdated: firstInstall.lastUpdated,
        installPath: firstInstall.installPath,
        gitCommitSha: firstInstall.gitCommitSha,
      }
    : undefined

  delete v2Data.plugins[pluginId]
  saveInstalledPluginsV2(v2Data)

  logForDebugging(`Removed installed plugin: ${pluginId}`)

  return metadata
}

/**
 * Delete a plugin's cache directory
 * This physically removes the plugin files from disk
 *
 * @param installPath - Absolute path to the plugin's cache directory
 */
/**
 * Export getGitCommitSha for use by pluginInstallationHelpers
 */
export { getGitCommitSha }

export function deletePluginCache(installPath: string): void {
  const fs = getFsImplementation()

  try {
    fs.rmSync(installPath, { recursive: true, force: true })
    logForDebugging(`Deleted plugin cache at ${installPath}`)

    // Clean up empty parent plugin directory (cache/{marketplace}/{plugin})
    // Versioned paths have structure: cache/{marketplace}/{plugin}/{version}
    const cachePath = getPluginCachePath()
    if (installPath.includes('/cache/') && installPath.startsWith(cachePath)) {
      const pluginDir = dirname(installPath) // e.g., cache/{marketplace}/{plugin}
      if (pluginDir !== cachePath && pluginDir.startsWith(cachePath)) {
        try {
          const contents = fs.readdirSync(pluginDir)
          if (contents.length === 0) {
            fs.rmdirSync(pluginDir)
            logForDebugging(`Deleted empty plugin directory at ${pluginDir}`)
          }
        } catch {
          // Parent dir doesn't exist or isn't readable — skip cleanup
        }
      }
    }
  } catch (error) {
    const errorMsg = errorMessage(error)
    logError(toError(error))
    throw new Error(
      `Failed to delete plugin cache at ${installPath}: ${errorMsg}`,
    )
  }
}

/**
 * Get the git commit SHA from a git repository directory
 * Returns undefined if not a git repo or if operation fails
 */
async function getGitCommitSha(dirPath: string): Promise<string | undefined> {
  const sha = await getHeadForDir(dirPath)
  return sha ?? undefined
}
