import assert from 'node:assert/strict'
import { test } from 'node:test'
import { missionSelectionKey } from '../src/utils/agentMissions.ts'
import { getConfiguredAgentMode, setAgentMode } from '../src/utils/agentMode.ts'
test('不同仓库使用独立的超级智能体任务选择键', () => {
  assert.notEqual(missionSelectionKey('/project/a'), missionSelectionKey('/project/b'))
  assert.equal(missionSelectionKey('/project/a/.'), missionSelectionKey('/project/a'))
})
test('保存的超级模式能跨会话被统一读取', () => {
  const previous = getConfiguredAgentMode()
  const env = process.env.CLAUDE_CODE_COORDINATOR_MODE
  try {
    setAgentMode('super')
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE
    assert.equal(getConfiguredAgentMode(), 'super')
  } finally {
    setAgentMode(previous)
    if (env === undefined) delete process.env.CLAUDE_CODE_COORDINATOR_MODE
    else process.env.CLAUDE_CODE_COORDINATOR_MODE = env
  }
})
