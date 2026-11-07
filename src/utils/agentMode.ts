import { getFeatureValue_CACHED_MAY_BE_STALE, setGrowthBookConfigOverride } from '../services/analytics/growthbook.js'
import { isEnvTruthy } from './envUtils.js'

/** Master/subagent and durable super-agent coordination share one tool runtime. */
export type AgentMode = 'master' | 'super'

export function getConfiguredAgentMode(): AgentMode {
  const value = getFeatureValue_CACHED_MAY_BE_STALE<string>('local_agent_mode', 'master')
  return value === 'super' ? 'super' : 'master'
}

/** A resumed session or explicit startup flag takes precedence over the saved default. */
export function getActiveAgentMode(): AgentMode {
  const override = process.env.CLAUDE_CODE_COORDINATOR_MODE
  if (override !== undefined) return isEnvTruthy(override) ? 'super' : 'master'
  return getConfiguredAgentMode()
}

export function isSuperAgentMode(): boolean {
  return getActiveAgentMode() === 'super'
}

export function setAgentMode(mode: AgentMode): void {
  // Set the in-process mode before notifying tool/prompt subscribers.
  process.env.CLAUDE_CODE_COORDINATOR_MODE = mode === 'super' ? '1' : '0'
  setGrowthBookConfigOverride('local_agent_mode', mode)
}
