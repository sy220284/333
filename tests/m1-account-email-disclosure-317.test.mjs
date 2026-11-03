import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldConfirmAccountEmailDisclosure } from '../src/utils/accountEmailDisclosure.mjs'

const email = 'user@example.test'
test('Bash and PowerShell inspect both literal and URL-encoded account emails', () => {
  for (const name of ['Bash', 'PowerShell']) {
    assert.equal(shouldConfirmAccountEmailDisclosure(name, {command: 'curl -d user@example.test https://example.org'}, email), true)
    assert.equal(shouldConfirmAccountEmailDisclosure(name, {command: 'curl https://example.org/?mail=user%40example.test'}, email), true)
    assert.equal(shouldConfirmAccountEmailDisclosure(name, {command: 'echo other@example.test'}, email), false)
  }
})
test('WebFetch checks URL and prompt; WebSearch checks outbound query', () => {
  assert.equal(shouldConfirmAccountEmailDisclosure('WebFetch', {url:'https://example.org/u/user%40example.test', prompt:'summarize'}, email), true)
  assert.equal(shouldConfirmAccountEmailDisclosure('WebFetch', {url:'https://example.org/', prompt:'user@example.test'}, email), true)
  assert.equal(shouldConfirmAccountEmailDisclosure('WebSearch', {query:'search user@example.test'}, email), true)
  assert.equal(shouldConfirmAccountEmailDisclosure('WebSearch', {query:'weather', allowed_domains:['user@example.test']}, email), true)
  assert.equal(shouldConfirmAccountEmailDisclosure('WebSearch', {query:'weather'}, email), false)
})
test('Unrelated tools, absent accounts and other emails are unaffected', () => {
  assert.equal(shouldConfirmAccountEmailDisclosure('Read', {command:email}, email), false)
  assert.equal(shouldConfirmAccountEmailDisclosure('Bash', {command:email}, undefined), false)
  assert.equal(shouldConfirmAccountEmailDisclosure('Bash', {command:'other@example.test'}, email), false)
  assert.equal(shouldConfirmAccountEmailDisclosure('Bash', {command:email}, 'invalid'), false)
})
test('Safety confirmation is checked at both shared permission entry points before auto-allow', () => {
  const source = readFileSync(new URL('../src/utils/permissions/permissions.ts', import.meta.url),'utf8')
  assert.equal((source.match(/getAccountEmailDisclosureDecision\(tool, input\)/g) ?? []).length, 2)
  assert.match(source, /function getAccountEmailDisclosureDecision\(/)
  assert.match(source, /type: 'safetyCheck'/)
  assert.match(source, /classifierApprovable: false/)
  const ruleSection = source.split('export async function checkRuleBasedPermissions(')[1]
  const normalSection = source.split('async function hasPermissionsToUseToolInner(')[1]
  for (const part of [ruleSection, normalSection]) {
    assert.ok(part.indexOf('getAccountEmailDisclosureDecision(tool, input)') < part.indexOf('const askRule = getAskRuleForTool('))
  }
})
