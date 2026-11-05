import assert from 'node:assert/strict'
import test from 'node:test'
import type Anthropic from '@anthropic-ai/sdk'
import { APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import { withRetry, CannotRetryError } from '../src/services/api/withRetry.ts'

const client = {} as Anthropic
const options = { model: 'claude-sonnet-5-5', thinkingConfig: { type: 'disabled' as const }, maxRetries: 2 }
const failure = (status: number, after = '0', message = 'fixture') => new APIError(status, { type: 'api_error', message }, message, new Headers({ 'retry-after': after }))

test('317 production retry aborts before creating a client', async () => {
  const controller = new AbortController(); controller.abort()
  const run = withRetry(async () => { throw new Error('must not connect') }, async () => 'ok', { ...options, signal: controller.signal })
  await assert.rejects(run.next(), APIUserAbortError)
})

test('317 production retry cancellation interrupts a long sleep with no later operation', async () => {
  const controller = new AbortController()
  let calls = 0
  const run = withRetry(async () => client, async () => { calls++; throw failure(500, '30') }, { ...options, signal: controller.signal })
  assert.equal((await run.next()).done, false)
  const next = run.next()
  controller.abort()
  await assert.rejects(next, APIUserAbortError)
  assert.equal(calls, 1)
})

test('317 production retry refuses excessive Retry-After without yielding a wait', async () => {
  const error = failure(500, '61')
  const run = withRetry(async () => client, async () => { throw error }, options)
  await assert.rejects(run.next(), e => e instanceof CannotRetryError && e.originalError === error)
})

test('317 production overflow caps output below a large thinking budget and stops non-progress', async () => {
  const error = failure(400, '0', 'input length and `max_tokens` exceed context limit: 94000 + 128000 > 100000')
  const overrides: Array<number | undefined> = []
  const run = withRetry(async () => client, async (_client, _attempt, context) => {
    overrides.push(context.maxTokensOverride); throw error
  }, { ...options, thinkingConfig: { type: 'enabled', budgetTokens: 10000 } })
  await assert.rejects(run.next(), e => e === error)
  assert.deepEqual(overrides, [undefined, 5000])
})

test('317 production retry returns the operation result and never retries non-retryable errors', async () => {
  const ok = withRetry(async () => client, async () => ({ result: 'ok' }), options)
  assert.deepEqual(await ok.next(), { done: true, value: { result: 'ok' } })
  let calls = 0
  const error = failure(418)
  const noRetry = withRetry(async () => client, async () => { calls++; throw error }, options)
  await assert.rejects(noRetry.next(), e => e instanceof CannotRetryError && e.originalError === error)
  assert.equal(calls, 1)
})
