export function migrateInstalledPluginsRecords(
  pluginsDirectory: string,
  resolveCachePath: (pluginId: string, version: string) => string,
): boolean
