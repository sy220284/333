import assert from 'node:assert/strict'
import test from 'node:test'
import { expandAutoModeRules, renderAutoModeRuleBlock } from '../src/utils/permissions/autoModeRules.mjs'

test('317 default rules expand once, in place', () => {
  assert.deepEqual(expandAutoModeRules([], ['a','b']), ['a','b'])
  assert.deepEqual(expandAutoModeRules(['only'], ['a','b']), ['only'])
  assert.deepEqual(expandAutoModeRules(['custom','$defaults','last','$defaults'], ['a','b']), ['custom','a','b','last'])
})
test('317 classifier keeps built-ins only when defaults are requested', () => {
  const base='- original'
  assert.equal(renderAutoModeRuleBlock([], base, ['builtin']), '- builtin\n- original')
  assert.equal(renderAutoModeRuleBlock(['custom'], base, ['builtin']), '- custom')
  assert.equal(renderAutoModeRuleBlock(['first','$defaults','last','$defaults'],base,['builtin']), '- first\n- builtin\n- original\n- last')
  assert.equal(renderAutoModeRuleBlock(['$defaults'], base), base)
  assert.equal(renderAutoModeRuleBlock(undefined, base), base)
})
