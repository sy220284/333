import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterAutoModeRulesByLabel as filter } from '../src/cli/handlers/autoModeCliPolicy.mjs'
test('317 label removes markup and matches section label regardless of case', () => {
  const rules = { allow: ['**Security Discussion**: read','Other: skip'], soft_deny: ['Credential Exploration [named+specifics]: stop'], hard_deny: ['Data Exfiltration: block'], environment: ['Organization: local'] }
  assert.deepEqual(filter(rules, 'security discussion').allow, [rules.allow[0]])
  assert.deepEqual(filter(rules, 'Data Exfiltration').hard_deny, [rules.hard_deny[0]])
  assert.deepEqual(filter(rules, 'credential exploration').soft_deny, [rules.soft_deny[0]])
  assert.equal(filter(rules, 'unmatched').environment.length, 0)
})
