import assert from 'node:assert/strict'
import test from 'node:test'
import { discoverIndependentModelDetails } from '../src/services/api/multimodel/registry.ts'
import { getModelMaxOutputTokens } from '../src/utils/context.ts'
test('provider model discovery retains published nested output limits', async () => {
  const fetcher = async () => Response.json({ data: [
    { id: 'MiniMax-M3.1-Flash', max_input_tokens: 123,
      limits: { context_window: 1000000, max_completion_tokens: 524288 } },
    { id: 'undocumented', max_input_tokens: 1024 },
  ] })
  const rows = await discoverIndependentModelDetails('minimax', 'test', fetcher as typeof fetch)
  assert.equal(rows[0]?.contextWindow, 1000000)
  assert.equal(rows[0]?.maxOutputTokens, 524288)
  assert.equal(rows[1]?.contextWindow, undefined)
})
test('M3.1 Flash can use more than 4096 output tokens without a manual profile', () => {
  const limits = getModelMaxOutputTokens('minimax/MiniMax-M3.1-Flash')
  assert.ok(limits.default >= 12000)
  assert.ok(limits.upperLimit >= 12000)
})

import { getStrictCommandScopeError } from '../src/utils/permissions/strictCommandScope.ts'
test('strict command scope cannot be widened by a classifier or an alternate tool', () => {
  const command = 'node --test check.mjs'
  assert.equal(getStrictCommandScopeError('Bash', { command }, command), undefined)
  const rejectedCalls = [
    ['Bash', { command: 'node -e "probe()"' }],
    ['Bash', { command: `${command} && node -e "probe()"` }],
    ['PowerShell', { command }],
    ['Agent', {}],
    ['mcp__shell__execute', { command }],
  ] as const
  for (const [tool, input] of rejectedCalls) {
    const rejected = getStrictCommandScopeError(tool, input, command)
    assert.ok(rejected)
    assert.match(rejected, /拒绝/)
  }
  assert.equal(getStrictCommandScopeError('Read', {}, command), undefined)
  assert.equal(getStrictCommandScopeError('Bash', { command: 'node -e' }, undefined), undefined)
})

import { SDKResultSuccessSchema, SDKResultErrorSchema } from '../src/entrypoints/sdk/coreSchemas.ts'
test('SDK result status schema rejects contradictory success/error combinations', () => {
  assert.equal(SDKResultSuccessSchema().shape.is_error.safeParse(true).success, false)
  assert.equal(SDKResultSuccessSchema().shape.is_error.safeParse(false).success, true)
  assert.equal(SDKResultErrorSchema().shape.is_error.safeParse(false).success, false)
  assert.equal(SDKResultErrorSchema().shape.is_error.safeParse(true).success, true)
})
