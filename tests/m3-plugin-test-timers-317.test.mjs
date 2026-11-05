import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPluginTestTimers317 } from '../src/cli/handlers/pluginTestTimers317.mjs'

test('317 plugin VM timer: async callback failure is retained for test result', async () => {
  const timers = createPluginTestTimers317()
  try {
    timers.setTimeout(async () => { throw new Error('timer exploded') }, 1)
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal(timers.failures.length, 1)
    assert.match(timers.failures[0].message, /timer exploded/)
  } finally { timers.dispose() }
})

test('317 plugin VM timer: environment teardown clears pending callbacks and is idempotent', async () => {
  const timers = createPluginTestTimers317()
  let fired = 0
  timers.setTimeout(() => { fired++ }, 20)
  timers.setInterval(() => { fired++ }, 20)
  timers.dispose()
  timers.dispose()
  await new Promise(resolve => setTimeout(resolve, 45))
  assert.equal(fired, 0)
  assert.throws(() => timers.setTimeout(() => {}, 1), /environment was unloaded/)
})

test('317 plugin VM timer: cancellation and malformed callbacks follow source semantics', async () => {
  const timers = createPluginTestTimers317()
  try {
    assert.throws(() => timers.setInterval('string', 1), /timer takes a function/)
    let count = 0
    const first = timers.setInterval(() => { count++ }, 1)
    await new Promise(resolve => setTimeout(resolve, 20))
    timers.clearInterval(first)
    const snapshot = count
    await new Promise(resolve => setTimeout(resolve, 15))
    assert.equal(count, snapshot)
  } finally { timers.dispose() }
})
