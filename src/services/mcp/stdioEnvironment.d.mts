export function buildStdioMcpEnvironment(
  inherited: NodeJS.ProcessEnv,
  configured?: Record<string, string>,
): NodeJS.ProcessEnv
