/** Agent Wizard 初始化为空对象，字段由各步骤按需累积。 */
import type { AgentDefinition } from '../../../tools/AgentTool/loadAgentsDir.js'
import type { AgentColorName } from '../../../tools/AgentTool/agentColorManager.js'
import type { AgentMemoryScope } from '../../../tools/AgentTool/agentMemory.js'
import type { SettingSource } from '../../../utils/settings/constants.js'
import type { generateAgent } from '../generateAgent.js'

export type AgentWizardData = {
  location?: SettingSource
  generationPrompt?: string
  agentType?: string
  systemPrompt?: string
  whenToUse?: string
  generatedAgent?: Awaited<ReturnType<typeof generateAgent>>
  isGenerating?: boolean
  wasGenerated?: boolean
  selectedTools?: AgentDefinition['tools']
  selectedModel?: AgentDefinition['model']
  selectedColor?: AgentColorName
  selectedMemory?: AgentMemoryScope
  finalAgent?: AgentDefinition
}
