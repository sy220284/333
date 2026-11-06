import { isEnvTruthy } from './envUtils.js'

/** Explicit opt-in via CLI --agent-teams or the existing agent-teams setting. */
function isAgentTeamsFlagSet(): boolean {
  return process.argv.includes('--agent-teams')
}

/**
 * Centralized runtime check for agent teams/teammate features.
 * This is the single gate that should be checked everywhere teammates
 * are referenced (prompts, code, tools isEnabled, UI, etc.).
 *
 * External users enable the feature via the opt-in setting or --agent-teams.
 * No remote experimentation or vendor entitlement is consulted.
 */
export function isAgentSwarmsEnabled(): boolean {
  // Ant: always on
  if (process.env.USER_TYPE === 'ant') {
    return true
  }

  // External: require opt-in via env var or --agent-teams flag
  if (
    !isEnvTruthy(process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS) &&
    !isAgentTeamsFlagSet()
  ) {
    return false
  }

  // Agent teams are an explicitly opted-in local capability.
  return true
}
