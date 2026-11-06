import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('正式构建接入协调者，且 Worker 可在模式切换后继续发现', () => {
  assert.match(read('build/rebuild.mjs'), /'COORDINATOR_MODE'/)
  assert.match(read('src/tools/AgentTool/builtInAgents.ts'), /agents\.push\(\.\.\.getCoordinatorAgents\(\)\)/)
  assert.match(read('src/coordinator/coordinatorMode.ts'), /isSuperAgentMode\(\)/)
})
test('命令入口使用既有智能体编辑器与任务中心，团队工具默认开放', () => {
  assert.match(read('src/commands/agents/index.ts'), /type: 'local-jsx'/)
  assert.match(read('src/commands/agents/agents.tsx'), /AgentsMenu/)
  assert.match(read('src/commands/agents/agents.tsx'), /BackgroundTasksDialog/)
  assert.match(read('src/utils/localCapabilities.ts'), /name === 'agent-teams'/)
  assert.match(read('src/hooks/useMergedTools.ts'), /agentMode,/)
})
