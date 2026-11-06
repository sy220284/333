import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('正式构建接入协调者，且 Worker 可在模式切换后继续发现', () => {
  assert.match(read('build/rebuild.mjs'), /'COORDINATOR_MODE'/)
  assert.match(read('src/tools/AgentTool/builtInAgents.ts'), /agents\.push\(\.\.\.getCoordinatorAgents\(\)\)/)
  assert.match(read('src/coordinator/coordinatorMode.ts'), /isSuperAgentMode\(\)/)
})
test('超级智能体工具池允许团队、智能体名录和工作流', () => {
  const source = read('src/constants/tools.ts')
  const coordinator = source.slice(source.indexOf('export const COORDINATOR_MODE_ALLOWED_TOOLS'))
  for (const feature of ['TEAM_CREATE_TOOL_NAME', 'TEAM_DELETE_TOOL_NAME', 'WORKFLOW_TOOL_NAME', "'ListAgents'", 'TASK_CREATE_TOOL_NAME']) {
    assert.ok(coordinator.includes(feature), '协调者应可使用 ' + feature)
  }
})
test('命令入口复用现有智能体编辑器与任务中心，团队工具默认开放', () => {
  assert.match(read('src/commands/agents/index.ts'), /type: 'local-jsx'/)
  assert.match(read('src/commands/agents/agents.tsx'), /AgentsMenu/)
  assert.match(read('src/commands/agents/agents.tsx'), /BackgroundTasksDialog/)
  assert.match(read('src/utils/localCapabilities.ts'), /name === 'agent-teams'/)
  assert.match(read('src/hooks/useMergedTools.ts'), /agentMode,/)
})
