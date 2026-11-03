import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { resolveSubagentEffortValue } from '../src/tools/AgentTool/subagentEffortPolicy.mjs'

const base = {
  parentModel: 'claude-opus',
  agentModel: 'claude-sonnet',
  parentEffort: 'max',
  savedEffort: 'medium',
  modelDefaultEffort: 'low',
}

test('2.1.317: a different-model agent uses saved effort rather than parent effort', () => {
  assert.equal(resolveSubagentEffortValue(base), 'medium')
})

test('2.1.317: a different-model agent falls back to its own model default', () => {
  assert.equal(resolveSubagentEffortValue({ ...base, savedEffort: undefined }), 'low')
  assert.equal(resolveSubagentEffortValue({ ...base, savedEffort: undefined, modelDefaultEffort: undefined }), undefined)
})

test('2.1.316: CLAUDE_CODE_SUBAGENT_EFFORT applies when no explicit agent effort exists', () => {
  assert.equal(resolveSubagentEffortValue({ ...base, environmentEffort: 'high' }), 'high')
})

test('explicit agent effort wins over environment, stored, model and parent defaults', () => {
  assert.equal(resolveSubagentEffortValue({ ...base, configuredEffort: 'low', environmentEffort: 'high' }), 'low')
})

test('same-model agents inherit parent effort only without a more specific setting', () => {
  assert.equal(resolveSubagentEffortValue({ ...base, agentModel: base.parentModel }), 'max')
  assert.equal(resolveSubagentEffortValue({ ...base, agentModel: base.parentModel, environmentEffort: 'low' }), 'low')
})

test('SDK isolated settingSources never injects persisted user effort into cross-model agent', () => {
  const source = readFileSync(new URL('../src/tools/AgentTool/runAgent.ts', import.meta.url), 'utf8')
  assert.match(source, /usesDifferentModel && isSettingSourceEnabled\('userSettings'\)/)
  assert.equal(resolveSubagentEffortValue({
    ...base, savedEffort: undefined, modelDefaultEffort: 'low',
  }), 'low')
})
