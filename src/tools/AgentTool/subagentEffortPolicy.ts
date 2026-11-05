/**
 * Subagent effort selection for Claude Code 2.1.316–2.1.317.
 * A different-model agent must not inherit a transient effort level
 * chosen for the main model. This function is pure so the precedence
 * contract can be verified without starting an agent session.
 */
import type { EffortValue } from '../../utils/effort.js'
export type SubagentEffortInputs317 = {
  configuredEffort?: EffortValue
  environmentEffort?: EffortValue
  savedEffort?: EffortValue
  modelDefaultEffort?: EffortValue
  parentEffort?: EffortValue
  agentModel: string
  parentModel: string
}
export function resolveSubagentEffortValue({
  configuredEffort,
  environmentEffort,
  savedEffort,
  modelDefaultEffort,
  parentEffort,
  agentModel,
  parentModel,
}: SubagentEffortInputs317): EffortValue | undefined {
  if (configuredEffort !== undefined) return configuredEffort
  if (environmentEffort !== undefined) return environmentEffort
  if (agentModel !== parentModel) return savedEffort ?? modelDefaultEffort
  return parentEffort
}
