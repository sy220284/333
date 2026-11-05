export function routeInstallConfigAssignments(
  assignments: readonly string[],
  pluginSchema: Record<string, unknown>,
  serverSchemas: Record<string, Record<string, unknown>>,
): {
  topLevel: Record<string, string>;
  servers: Record<string, Record<string, string>>;
};
