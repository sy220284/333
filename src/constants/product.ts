export const PRODUCT_URL = 'https://github.com/sy220284/333'

// Claude Code Remote session URLs
export const CLAUDE_AI_BASE_URL = 'https://claude.ai'
export const CLAUDE_AI_STAGING_BASE_URL = 'https://claude-ai.staging.ant.dev'
export const CLAUDE_AI_LOCAL_BASE_URL = 'http://localhost:4000'

/**
 * Determine if we're in a staging environment for remote sessions.
 * Checks session ID format and ingress URL.
 */
export function isRemoteSessionStaging(
  sessionId?: string,
  ingressUrl?: string,
): boolean {
  return (
    sessionId?.includes('_staging_') === true ||
    ingressUrl?.includes('staging') === true
  )
}

/**
 * Determine if we're in a local-dev environment for remote sessions.
 * Checks session ID format (e.g. `session_local_...`) and ingress URL.
 */
export function isRemoteSessionLocal(
  sessionId?: string,
  ingressUrl?: string,
): boolean {
  return (
    sessionId?.includes('_local_') === true ||
    ingressUrl?.includes('localhost') === true
  )
}

/**
 * Get the base URL for Claude AI based on environment.
 */
export function getClaudeAiBaseUrl(
  sessionId?: string,
  ingressUrl?: string,
): string {
  if (isRemoteSessionLocal(sessionId, ingressUrl)) {
    return CLAUDE_AI_LOCAL_BASE_URL
  }
  if (isRemoteSessionStaging(sessionId, ingressUrl)) {
    return CLAUDE_AI_STAGING_BASE_URL
  }
  return CLAUDE_AI_BASE_URL
}

/**
 * Build the user-facing URL with the session-management session_* identifier.
 * Worker endpoints use cse_* IDs and are converted at their own API boundary.
 */
export function getRemoteSessionUrl(
  sessionId: string,
  ingressUrl?: string,
): string {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { toSessionApiId } =
    require('../bridge/sessionIdProtocol.js') as typeof import('../bridge/sessionIdProtocol.js')
  /* eslint-enable @typescript-eslint/no-require-imports */
  const sessionApiId = toSessionApiId(sessionId)
  const baseUrl = getClaudeAiBaseUrl(sessionApiId, ingressUrl)
  return `${baseUrl}/code/${sessionApiId}`
}
