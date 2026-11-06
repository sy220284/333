import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
test('长期任务接入协调提示词与 Agent/Workflow 生命周期', () => {
  assert.match(read('src/coordinator/coordinatorMode.ts'), /getSelectedMissionPrompt/)
  assert.match(read('src/tools/AgentTool/AgentTool.tsx'), /linkMissionAssignment/)
  assert.match(read('src/tools/AgentTool/agentToolUtils.ts'), /syncMissionOutcome/)
  assert.match(read('src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts'), /linkMissionAssignment/)
  assert.match(read('src/commands/agents/agents.tsx'), /mission new/)
})
