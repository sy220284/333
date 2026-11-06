import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('正式构建接入协调者，且 Worker 可在模式切换后继续发现', () => {
  assert.match(read('build/rebuild.mjs'), /'COORDINATOR_MODE'/)
  assert.match(read('src/tools/AgentTool/builtInAgents.ts'), /agents\.push\(\.\.\.getCoordinatorAgents\(\)\)/)
  assert.match(read('src/coordinator/coordinatorMode.ts'), /isSuperAgentMode\(\)/)
  assert.match(read('src/utils/systemPrompt.ts'), /isSuperAgentMode\(\)/)
  assert.match(read('src/QueryEngine.ts'), /getCoordinatorModule\?\.isCoordinatorMode\(\)/)
})
test('超级智能体工具池允许团队、智能体名录和工作流', () => {
  const source = read('src/constants/tools.ts')
  const coordinator = source.slice(source.indexOf('export const COORDINATOR_MODE_ALLOWED_TOOLS'))
  for (const feature of ['TEAM_CREATE_TOOL_NAME', 'TEAM_DELETE_TOOL_NAME', 'WORKFLOW_TOOL_NAME', "'ListAgents'", 'TASK_CREATE_TOOL_NAME']) {
    assert.ok(coordinator.includes(feature), `协调者应可使用 ${feature}`)
  }
})
test('命令入口复用现有智能体编辑器与任务中心，团队工具默认开放', () => {
  assert.match(read('src/commands/agents/index.ts'), /type: 'local-jsx'/)
  assert.match(read('src/commands/agents/agents.tsx'), /AgentsMenu/)
  assert.match(read('src/commands/agents/agents.tsx'), /BackgroundTasksDialog/)
  assert.match(read('src/utils/localCapabilities.ts'), /name === 'agent-teams'/)
  assert.match(read('src/hooks/useMergedTools.ts'), /agentMode,/)
})

test('协调者模式由单一状态入口驱动，执行前统一校验长期任务授权', () => {
  const agent = read('src/tools/AgentTool/AgentTool.tsx')
  assert.match(agent, /getPrompt\(filteredAgents, isCoordinatorMode\(\), allowedAgentTypes\)/)
  assert.match(agent, /const isCoordinator = isCoordinatorMode\(\)/)
  assert.doesNotMatch(agent, /feature\('COORDINATOR_MODE'\) \? isEnvTruthy/)
  assert.match(agent, /await requireActiveSelectedMission\(\)/)
  assert.match(read('src/tools/TeamCreateTool/TeamCreateTool.ts'), /await requireActiveSelectedMission\(\)/)
  assert.match(read('src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts'), /await requireActiveSelectedMission\(\)/)
  assert.match(read('src/utils/swarm/teamHelpers.ts'), /finishMissionAssignment\(missionId, `team:\$\{name\}`, 'killed'\)/)
})

test('SDK 终态区分成功与失败，任务结束类型不接受 running', () => {
  const query = read('src/QueryEngine.ts')
  assert.match(query, /subtype: 'error_during_execution',\s*is_error: true,\s*terminal_reason: promptTooLong/)
  assert.match(query, /errors: \[textResult \|\| `API request failed/)
  assert.match(read('src/remote/sdkMessageAdapter.ts'), /return msg.subtype === 'success'/)
  assert.match(read('src/tools/AgentTool/agentToolUtils.ts'), /status: Exclude<MissionAssignmentStatus, 'running'>/)
})

test('智能体中心按项目过滤长期任务，并显示全部执行类型', () => {
  const center = read('src/commands/agents/agents.tsx')
  assert.match(center, /resolve\(m.projectDir\) === resolve\(getCwd\(\)\)/)
  assert.match(center, /task.type === 'local_workflow' && task.status === 'running'/)
  assert.match(center, /setAgentMode\('super'\)/)
  assert.match(read('src/utils/agentMissions.ts'), /if \(status === 'completed'\)/)
})

test('Workflow 恢复支持已结束的跨会话执行并保留原日志',()=>{
  const history=read('src/tasks/LocalWorkflowTask/workflowHistory.ts')
  const runtime=read('src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts')
  const entry=read('src/tools/WorkflowTool/WorkflowTool.ts')
  assert.match(history,/findWorkflowResumeSource/)
  assert.match(runtime,/resumedFromSessionId/)
  assert.match(runtime,/writeFile\(journal,previousJournal,\{flag:'wx'/)
  assert.match(entry,/findWorkflowResumeSource/)
})
