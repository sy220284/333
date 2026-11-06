import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getActiveAgentMode, getConfiguredAgentMode, setAgentMode } from '../src/utils/agentMode.ts'
import { isLocalCapabilityEnabled, setLocalCapabilityEnabled } from '../src/utils/localCapabilities.ts'

test('主从和超级智能体模式可以切换并持久保存', () => {
  const before = getConfiguredAgentMode()
  const environment = process.env.CLAUDE_CODE_COORDINATOR_MODE
  try {
    setAgentMode('super')
    assert.equal(getConfiguredAgentMode(), 'super')
    assert.equal(getActiveAgentMode(), 'super')
    setAgentMode('master')
    assert.equal(getActiveAgentMode(), 'master')
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'
    assert.equal(getActiveAgentMode(), 'super')
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '0'
    assert.equal(getActiveAgentMode(), 'master')
  } finally {
    setAgentMode(before)
    if (environment === undefined) delete process.env.CLAUDE_CODE_COORDINATOR_MODE
    else process.env.CLAUDE_CODE_COORDINATOR_MODE = environment
  }
})

test('团队协作默认可用，支持用户主动关闭与恢复', () => {
  const before = isLocalCapabilityEnabled('agent-teams')
  try {
    setLocalCapabilityEnabled('agent-teams', false)
    assert.equal(isLocalCapabilityEnabled('agent-teams'), false)
    setLocalCapabilityEnabled('agent-teams', true)
    assert.equal(isLocalCapabilityEnabled('agent-teams'), true)
  } finally {
    setLocalCapabilityEnabled('agent-teams', before)
  }
})
