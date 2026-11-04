import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldConfirmAccountEmailDisclosure } from '../src/utils/accountEmailDisclosure.mjs'

const email = 'user@example.test'
const toolInput = command => ({ command })

test('2.1.317 shell and monitor tools ask only for potentially network-capable commands', () => {
  for (const tool of ['Bash', 'Monitor', 'PowerShell', 'Tmux']) {
    assert.equal(shouldConfirmAccountEmailDisclosure(tool, toolInput('curl -d user@example.test https://other.test'), email), true, tool)
    assert.equal(shouldConfirmAccountEmailDisclosure(tool, toolInput('ssh user@example.test'), email), true, tool)
    assert.equal(shouldConfirmAccountEmailDisclosure(tool, toolInput('echo user@example.test'), email), false, tool)
    assert.equal(shouldConfirmAccountEmailDisclosure(tool, toolInput('printf user@example.test'), email), false, tool)
    assert.equal(shouldConfirmAccountEmailDisclosure(tool, toolInput('git status && echo user@example.test'), email), false, tool)
    assert.equal(shouldConfirmAccountEmailDisclosure(tool, toolInput('curl other@example.test https://other.test'), email), false, tool)
  }
})
test('URL and percent escapes are normalized before email comparison', () => {
  const input = toolInput('wget https://other.test/?email=user%40example.test')
  assert.equal(shouldConfirmAccountEmailDisclosure('Bash', input, email), true)
  assert.equal(shouldConfirmAccountEmailDisclosure('Bash', toolInput('echo user%40example.test'), email), false)
  assert.equal(shouldConfirmAccountEmailDisclosure('Bash', toolInput('echo other@example.test'), email), false)
})
test('all official web tool surfaces prompt on account-email disclosure', () => {
  for (const name of ['WebBrowser', 'WebFetch', 'WebSearch']) {
    assert.equal(shouldConfirmAccountEmailDisclosure(name, {nested:{query:'user@example.test'}}, email), true, name)
    assert.equal(shouldConfirmAccountEmailDisclosure(name, {url:'https://other.test/?mail=user%40example.test'}, email), true, name)
    assert.equal(shouldConfirmAccountEmailDisclosure(name, {query:'weather'}, email), false, name)
  }
})
test('account identity and tool allowlist guard against unrelated inputs', () => {
  assert.equal(shouldConfirmAccountEmailDisclosure('Read', toolInput('curl user@example.test'), email), false)
  assert.equal(shouldConfirmAccountEmailDisclosure('Bash', toolInput('curl user@example.test'), undefined), false)
  assert.equal(shouldConfirmAccountEmailDisclosure('Bash', toolInput('curl user@example.test'), 'invalid'), false)
  assert.equal(shouldConfirmAccountEmailDisclosure('Bash', toolInput('curl user@example.test'), 'OTHER@example.test'), false)
  assert.equal(shouldConfirmAccountEmailDisclosure('WebSearch', {query:'user@example.test'}, 'USER@EXAMPLE.TEST'), true)
})
test('both permission pipelines preserve deny before disclosure, and disclosure before bypass', () => {
  const source = readFileSync(new URL('../src/utils/permissions/permissions.ts', import.meta.url), 'utf8')
  assert.equal((source.match(/getAccountEmailDisclosureDecision\(tool, input\)/g) ?? []).length, 2)
  assert.match(source, /type: 'safetyCheck'/)
  assert.match(source, /classifierApprovable: false/)
  const first = source.split('export async function checkRuleBasedPermissions(')[1].split('async function hasPermissionsToUseToolInner(')[0]
  const second = source.split('async function hasPermissionsToUseToolInner(')[1].split('type EditPermissionRuleArgs')[0]
  for (const segment of [first, second]) {
    const deny = segment.indexOf("if (toolPermissionResult?.behavior === 'deny')")
    const disclosure = segment.indexOf('getAccountEmailDisclosureDecision(tool, input)')
    const allowed = segment.indexOf('const askRule = getAskRuleForTool(')
    assert.ok(deny >= 0 && disclosure > deny, 'tool-specific deny must precede email check')
    assert.ok(allowed >= 0 && disclosure > allowed, 'explicit tool-level ask rule remains earlier')
  }
  assert.ok(second.indexOf('getAccountEmailDisclosureDecision(tool, input)') <
    second.indexOf("const shouldBypassPermissions ="), 'disclosure must precede bypassPermissions')
})
