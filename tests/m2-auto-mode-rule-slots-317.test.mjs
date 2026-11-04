import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { expandAutoModeRules, renderAutoModeRuleBlock, parseTaggedAutoModeBullets, mergeAutoModeRulesBySource } from '../src/utils/permissions/autoModeRules.mjs'

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

test('317 external classifier resource exposes 16/72/1/21 rules with nested hard-deny bullets preserved', () => {
  const txt = readFileSync(new URL('../src/utils/permissions/yolo-classifier-prompts/permissions_external.txt', import.meta.url), 'utf8')
  for (const [tag, expected] of [
    ['user_allow_rules_to_replace', 16],
    ['user_soft_deny_rules_to_replace', 72],
    ['user_hard_deny_rules_to_replace', 1],
    ['user_environment_to_replace', 21],
  ]) {
    assert.equal(parseTaggedAutoModeBullets(txt, tag).length, expected, tag)
  }
  const hard = parseTaggedAutoModeBullets(txt, 'user_hard_deny_rules_to_replace')
  assert.ok(hard[0].includes('\n  - **What is being sent?**'))
})

test('317 trusted auto mode rule sources ignore repository local and project settings', () => {
  assert.deepEqual(mergeAutoModeRulesBySource({
    localSettings: { allow: ['dangerous'] },
    projectSettings: { allow: ['dangerous'] },
    userSettings: { allow: ['read-only'] },
  }), { allow: ['read-only'] })
})
test('317 managed allow rule prevents flag $defaults from reintroducing exceptions', () => {
  const config = mergeAutoModeRulesBySource({
    userSettings: { allow: ['user'] },
    flagSettings: { allow: ['$defaults', 'flag'] },
    policySettings: { allow: ['managed'] },
  })
  assert.deepEqual(config.allow, ['user', 'flag', 'managed'])
  assert.deepEqual(mergeAutoModeRulesBySource({
    flagSettings: { allow: ['$defaults', 'flag'] },
    policySettings: { allow: ['$defaults', 'managed'] },
  }).allow, ['$defaults', 'flag', '$defaults', 'managed'])
})
test('317 per-source soft/hard deny and environment are additive', () => {
  assert.deepEqual(mergeAutoModeRulesBySource({
    userSettings: { soft_deny: ['soft'], hard_deny: ['hard'], environment: ['env1'] },
    policySettings: { soft_deny: ['policy-soft'], hard_deny: ['policy-hard'], environment: ['env2'] },
  }), { soft_deny: ['soft','policy-soft'], hard_deny: ['hard','policy-hard'], environment: ['env1','env2'] })
})
