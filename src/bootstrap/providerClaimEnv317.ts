/**
 * Original 317 hUn() host-managed claim environment isolation.
 * Clear the previous warm session's provider, proxy and CA routing before
 * applying the accepted session's environment. Ordinary claims keep it.
 */
import { isEnvTruthy } from '../utils/envUtils.js'
import { isProviderManagedEnvVar } from '../utils/managedEnvConstants.js'

const HOST_CLAIM_KEYS_317 = new Set([
  'CLAUDE_CODE_USE_ANTHROPIC_AWS','CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD',
  'CLAUDE_CODE_USE_MANTLE','CLAUDE_CODE_USE_GATEWAY',
  'ANTHROPIC_AWS_BASE_URL','ANTHROPIC_GOOGLE_CLOUD_BASE_URL',
  'ANTHROPIC_BEDROCK_MANTLE_BASE_URL','ANTHROPIC_AWS_WORKSPACE_ID',
  'ANTHROPIC_GOOGLE_CLOUD_PROJECT','ANTHROPIC_GOOGLE_CLOUD_LOCATION',
  'ANTHROPIC_GOOGLE_CLOUD_WORKSPACE_ID',
  '_CLAUDE_CODE_ASSUME_FIRST_PARTY_BASE_URL','ANTHROPIC_CUSTOM_HEADERS',
  'ANTHROPIC_FOUNDRY_AUTH_TOKEN','ANTHROPIC_AWS_API_KEY',
  'CLAUDE_CODE_HOST_AUTH_ENV_VAR','CLAUDE_CODE_OAUTH_REFRESH_TOKEN',
  'CLAUDE_CODE_OAUTH_SCOPES','CLAUDE_CODE_OAUTH_CLIENT_ID',
  'CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH',
  'CLAUDE_CODE_SKIP_ANTHROPIC_GOOGLE_CLOUD_AUTH',
  'CLAUDE_CODE_SKIP_MANTLE_AUTH',
  'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY',
  'CLAUDE_CODE_HTTP_PROXY','CLAUDE_CODE_HTTPS_PROXY',
  'NPM_CONFIG_PROXY','NPM_CONFIG_HTTP_PROXY','NPM_CONFIG_HTTPS_PROXY',
  'NODE_EXTRA_CA_CERTS','CLAUDE_CODE_CLIENT_CERT',
  'CLAUDE_CODE_CLIENT_KEY','CLAUDE_CODE_CLIENT_KEY_PASSPHRASE',
  'ANTHROPIC_DEFAULT_MODEL','ANTHROPIC_DEFAULT_FABLE_MODEL',
  'CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL',
])
const HOST_CLAIM_PREFIXES_317 = ['VERTEX_REGION_CLAUDE_', 'ANTHROPIC_DEFAULT_FABLE_MODEL_']

export function clearInheritedHostProviderEnvironment317(
  accepted: Readonly<Record<string, unknown>>,
  inherited: Record<string, string | undefined>,
): void {
  if (!isEnvTruthy(accepted.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST as string | undefined)) return
  for (const name of Object.keys(inherited)) {
    const key = name.toUpperCase()
    if (isProviderManagedEnvVar(name) ||
        HOST_CLAIM_KEYS_317.has(key) ||
        HOST_CLAIM_PREFIXES_317.some(prefix => key.startsWith(prefix))) {
      delete inherited[name]
    }
  }
}
