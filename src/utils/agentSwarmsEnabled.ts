import { isEnvTruthy } from './envUtils.js'
import { isLocalCapabilityEnabled } from './localCapabilities.js'

/** Team tools are available by default; retain explicit CLI and local preference controls. */
function isAgentTeamsFlagSet(): boolean {
  return process.argv.includes('--agent-teams')
}

/**
 * Centralized runtime check for agent teams/teammate features.
 * This is the single gate that should be checked everywhere teammates
 * are referenced (prompts, code, tools isEnabled, UI, etc.).
 *
 * External users receive this capability by default; a local preference may disable it.
 * No remote experimentation or vendor entitlement is consulted.
 */
export function isAgentSwarmsEnabled(): boolean {
  // Ant: always on
  if (process.env.USER_TYPE === 'ant') {
    return true
  }

  // Explicit environment or CLI enables take precedence; otherwise use the local default.
  if (
    !isEnvTruthy(process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS) &&
    !isAgentTeamsFlagSet() &&
    !isLocalCapabilityEnabled('agent-teams')
  ) {
    return false
  }

  // Team tools operate entirely on local sessions.
  return true
}
