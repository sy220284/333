export function migrateInstalledPluginsRecords(
  pluginsDirectory: string,
  resolveCachePath: (pluginId: string, version: string) => string,
): boolean

export function normalizeInstalledPluginsRecords(
  data: unknown,
  resolveCachePath: (pluginId: string, version: string) => string,
): unknown
