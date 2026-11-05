import assert from 'node:assert/strict'
import test from 'node:test'
import { getRetryDelay, getRetryLimit, adjustOverflowOutputTokens, getRetryWaitLimit } from '../src/services/api/retryPolicy317.ts'

test('317 Retry-After cannot shorten backoff; jitter is rounded', () => {
  assert.equal(getRetryDelay(2, '0', undefined, () => .333), 1083)
  assert.equal(getRetryDelay(1, '-5', undefined, () => 0), 500)
  assert.equal(getRetryDelay(1, '2.9', undefined, () => 0), 2000)
  assert.equal(getRetryDelay(9, 'invalid', undefined, () => 1), 40000)
  assert.equal(getRetryDelay(3, null, 1200, () => .5, 750), 1350)
})

test('317 ordinary retry waits have a 60s ceiling with an overload override', () => {
  assert.equal(getRetryWaitLimit(), 60000)
  assert.equal(getRetryWaitLimit(80000), 100000)
  assert.equal(getRetryDelay(1, '61', undefined, () => 0) > getRetryWaitLimit(), true)
})

test('317 output overflow shrinks to actual space and rejects repeated non-progress', () => {
  assert.equal(adjustOverflowOutputTokens(94000, 100000), 5000)
  assert.equal(adjustOverflowOutputTokens(95000, 100000, 5000), 4000)
  assert.equal(adjustOverflowOutputTokens(94000, 100000, 5000), undefined)
  assert.equal(adjustOverflowOutputTokens(93000, 100000, 5000), undefined)
  assert.equal(adjustOverflowOutputTokens(97000, 100000), undefined)
  assert.equal(adjustOverflowOutputTokens(96000, 100000), 3000)
})

test('317 retry env defaults, nonnegative values and foreground clamp', () => {
  for (const value of [undefined, 'bad', '-1']) assert.equal(getRetryLimit(value, false), 10)
  assert.equal(getRetryLimit(undefined, true), 300)
  assert.equal(getRetryLimit('', false), 0)
  assert.equal(getRetryLimit('0', false), 0)
  assert.equal(getRetryLimit('20', false), 15)
  assert.equal(getRetryLimit('20', true), 20)
  assert.equal(getRetryLimit('2.5', false), 2.5)
})

test('317 arithmetic matches the original decompiled functions', { skip: !process.env.CLAUDE_CODE_317_DECOMPILED }, async () => {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { runInNewContext } = await import('node:vm')
  const root = join(process.env.CLAUDE_CODE_317_DECOMPILED, '04_逐模块可阅读JavaScript')
  const shared = readFileSync(join(root, 'chunk-k4p8c4ay.js'), 'utf8')
  const delay = readFileSync(join(root, 'chunk-r6v32v6p.js'), 'utf8')
  const retry = readFileSync(join(root, 'chunk-thp9mgjc.js'), 'utf8')
  const gy = shared.slice(shared.indexOf('function Gy('), shared.indexOf('class n_o'))
  const originalDelay = delay.slice(delay.indexOf('var M = 500'), delay.indexOf('var nHi ='))
  const originalLimit = retry.slice(retry.indexOf('function YZe()'), retry.indexOf('function Vwr('))
  let persistent = false
  const env = {}
  const original = runInNewContext(`${gy}\n${originalDelay}\n${originalLimit}\n({delay:I$,limit:YZe})`, {
    i: env, AS: () => persistent, LZe: 15, hwr: 300, gwr: 10, Hs: () => ({ once: () => false }),
  })
  for (persistent of [false, true]) for (const value of [undefined, '', '0', '2.5', '20', '-1', 'bad', 'Infinity']) {
    env.CLAUDE_CODE_MAX_RETRIES = value
    assert.equal(getRetryLimit(value, persistent), Number(original.limit()))
  }
  for (const attempt of [1, 2, 3, 6, 12, 30]) for (const header of [null, '', '0', '-1', '1', '2.9', '61', '999999', 'bad', 'Wed, 21 Oct 2015 07:28:00 GMT']) {
    for (const cap of [undefined, 1000, 80000]) for (const base of [undefined, 800]) for (const random of [0, .123456, .5, .999]) {
      assert.equal(getRetryDelay(attempt, header, cap, () => random, base), original.delay(attempt, header, cap, () => random, base))
    }
  }
})
