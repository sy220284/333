import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { describeMcpUrlElicitationRejection } from '../src/services/mcp/elicitationOutcome.ts'

test('SDK/print 未答复授权时明确告知不自动重试', () => {
  const result = describeMcpUrlElicitationRejection('publish_post', 'cancel', true)
  assert.match(result, /no answer was received/)
  assert.match(result, /No approval/)
  assert.match(result, /Do not automatically repeat this tool call/)
  assert.match(result, /publish_post/)
})

test('SDK/print 拒绝授权保持明确的拒绝结果', () => {
  const result = describeMcpUrlElicitationRejection('publish_post', 'decline', true)
  assert.match(result, /declined by the user/)
  assert.doesNotMatch(result, /no answer was received/)
})

test('交互会话主动取消仍保留取消文案', () => {
  const result = describeMcpUrlElicitationRejection('read_only_tool', 'cancel', false)
  assert.match(result, /cancelled by the user/)
  assert.doesNotMatch(result, /no answer was received/)
})

test('未知结果不会被替换为同名工具，也不会重跑', () => {
  const source = readFileSync(
    new URL('../src/services/mcp/client.ts', import.meta.url),
    'utf8',
  )
  assert.match(source, /describeMcpUrlElicitationRejection\(\s*tool,\s*finalResult\.action,\s*handleElicitation !== undefined/)
  const wrapper = source.slice(source.indexOf('export async function callMCPToolWithUrlElicitationRetry('))
  const rejectBranch = wrapper.slice(wrapper.indexOf("if (finalResult.action !== 'accept')"))
  assert.ok(rejectBranch.indexOf('return {') < rejectBranch.indexOf('Loop back to retry'))
})
