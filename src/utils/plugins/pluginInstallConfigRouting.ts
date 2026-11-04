/**
 * Route plugin-install --config assignments to top-level userConfig or
 * a bundled MCP server's user_config. Resolve and validate all targets
 * before touching persistent settings or keychain storage.
 */
export function routeInstallConfigAssignments(assignments, pluginSchema, serverSchemas) : { topLevel: {}; servers: {}; } {
  const topLevel = {};
  const servers = {};
  for (const assignment of assignments) {
    const separator = assignment.indexOf('=');
    if (separator <= 0) throw new Error('--config requires <key=value>');
    const key = assignment.slice(0, separator);
    const value = assignment.slice(separator + 1);
    if (!value.trim()) {
      throw new Error(`--config ${key}: value is empty. Omit the flag to leave it unset.`);
    }
    if (Object.hasOwn(pluginSchema, key)) {
      topLevel[key] = value;
      continue;
    }
    const qualified = Object.keys(serverSchemas)
      .filter(server => key.startsWith(server + '.') &&
        Object.hasOwn(serverSchemas[server], key.slice(server.length + 1)))
      .sort((a, b) => b.length - a.length);
    if (qualified.length > 0) {
      const server = qualified[0];
      const field = key.slice(server.length + 1);
      (servers[server] ??= {})[field] = value;
      continue;
    }
    const candidates = Object.keys(serverSchemas)
      .filter(server => Object.hasOwn(serverSchemas[server], key));
    if (candidates.length === 1) {
      (servers[candidates[0]] ??= {})[key] = value;
      continue;
    }
    if (candidates.length > 1) {
      throw new Error(`--config key "${key}" is ambiguous; use <server>.${key}=<value>.`);
    }
    const known = [
      ...Object.keys(pluginSchema),
      ...Object.entries(serverSchemas).flatMap(([server, schema]) =>
        Object.keys(schema).map(field => `${server}.${field}`)),
    ];
    throw new Error(`--config key "${key}" is not declared in this plugin's userConfig. Known keys: ${known.join(', ')}.`);
  }
  return { topLevel, servers };
}
