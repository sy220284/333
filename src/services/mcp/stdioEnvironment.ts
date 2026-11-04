/**
 * Construct the environment used for an MCP stdio child process.
 * A configured empty Bedrock bearer token is a request to UNSET the key
 * so the MCP server's AWS credential chain can discover its own identity.
 */
export function buildStdioMcpEnvironment(inherited: NodeJS.ProcessEnv, configured: Record<string,string>|undefined) {
  const env = { ...inherited, ...configured }
  if (configured?.AWS_BEARER_TOKEN_BEDROCK === '') {
    delete env.AWS_BEARER_TOKEN_BEDROCK
  }
  return env
}
