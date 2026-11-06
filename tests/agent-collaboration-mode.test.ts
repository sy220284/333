import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getActiveAgentMode, getConfiguredAgentMode, setAgentMode } from '../src/utils/agentMode.ts'
import { isLocalCapabilityEnabled, setLocalCapabilityEnabled } from '../src/utils/localCapabilities.ts'
import { isAgentSwarmsEnabled } from '../src/utils/agentSwarmsEnabled.ts'

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


test('官方 USER_TYPE 不绕过本地多智能体关闭设置', () => {
  const before = isLocalCapabilityEnabled('agent-teams')
  const userType = process.env.USER_TYPE
  const experimental = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
  try {
    setLocalCapabilityEnabled('agent-teams', false)
    process.env.USER_TYPE = 'ant'
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
    assert.equal(isAgentSwarmsEnabled(), false)
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1'
    assert.equal(isAgentSwarmsEnabled(), true)
    setLocalCapabilityEnabled('agent-teams', true)
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
    assert.equal(isAgentSwarmsEnabled(), true)
  } finally {
    setLocalCapabilityEnabled('agent-teams', before)
    if (userType === undefined) delete process.env.USER_TYPE
    else process.env.USER_TYPE = userType
    if (experimental === undefined) delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
    else process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = experimental
  }
})
