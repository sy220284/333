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
