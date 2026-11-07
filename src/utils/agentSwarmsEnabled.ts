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
  // Local user setting is authoritative by default; explicit startup flags
  // may enable the tool for this process without changing persisted settings.
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
