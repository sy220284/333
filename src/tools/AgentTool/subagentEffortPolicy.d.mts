import type { EffortValue } from '../../utils/effort.js'

export function resolveSubagentEffortValue(options: {
  configuredEffort?: EffortValue
  environmentEffort?: EffortValue
  savedEffort?: EffortValue
  modelDefaultEffort?: EffortValue
  parentEffort?: EffortValue
  agentModel: string
  parentModel: string
}): EffortValue | undefined
