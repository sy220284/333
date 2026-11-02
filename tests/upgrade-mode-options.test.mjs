import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  restrictedToolDenyList,
  parsePromptSuggestions,
} from '../src/services/cli/upgradeMode.mjs'

test('restricted default excludes executor and network fetch tools', () => {
  assert.deepEqual(restrictedToolDenyList(['default']), ['Bash', 'PowerShell', 'WebFetch'])
  assert.deepEqual(restrictedToolDenyList([]), ['Bash', 'PowerShell', 'WebFetch'])
})
test('restricted explicit tool allowlist preserves listed executors', () => {
  assert.deepEqual(restrictedToolDenyList(['Bash,Read']), ['PowerShell', 'WebFetch'])
  assert.deepEqual(restrictedToolDenyList(['Read'], ['Edit']), ['Edit', 'Bash', 'PowerShell', 'WebFetch'])
  assert.deepEqual(restrictedToolDenyList(['WebFetch', 'PowerShell', 'Bash']), [])
})
test('prompt suggestion truth table matches native choices', () => {
  assert.equal(parsePromptSuggestions(undefined), undefined)
  for (const value of [true, 'true', '1', 'yes', 'on']) assert.equal(parsePromptSuggestions(value), true)
  for (const value of [false, 'false', '0', 'no', 'off']) assert.equal(parsePromptSuggestions(value), false)
  for (const value of ['invalid', 'enabled', '']) assert.throws(() => parsePromptSuggestions(value))
})
