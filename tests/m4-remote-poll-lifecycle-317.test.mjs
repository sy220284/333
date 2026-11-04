import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPollingLifecycle } from '../src/utils/task/pollingLifecycle317.mjs'

function fakeTimers() {
  const queued = new Map()
  let nextId = 1
  return {
    queued,
    schedule(callback, delay) {
      const id = nextId++
      queued.set(id, { callback, delay })
      return id
    },
    cancel(id) { queued.delete(id) },
    fire(id) {
      const entry = queued.get(id)
      queued.delete(id)
      assert.ok(entry)
      entry.callback()
    },
  }
}

test('2.1.317 remote task: stop cancels queued poll and blocks scheduling', () => {
  const timers = fakeTimers()
  const lifecycle = createPollingLifecycle(timers)
  let polls = 0
  lifecycle.schedule(() => { polls++ }, 1000)
  assert.equal(timers.queued.size, 1)
  lifecycle.stop()
  assert.equal(lifecycle.active, false)
  assert.equal(timers.queued.size, 0)
  lifecycle.schedule(() => { polls++ }, 1000)
  assert.equal(timers.queued.size, 0)
  assert.equal(polls, 0)
})

test('2.1.317 remote task: rescheduling replaces old timer and runs only latest', () => {
  const timers = fakeTimers()
  const lifecycle = createPollingLifecycle(timers)
  const calls = []
  lifecycle.schedule(() => calls.push('old'), 1000)
  lifecycle.schedule(() => calls.push('current'), 1000)
  assert.equal(timers.queued.size, 1)
  const [id] = timers.queued.keys()
  timers.fire(id)
  assert.deepEqual(calls, ['current'])
  assert.equal(timers.queued.size, 0)
})

test('2.1.317 remote task: late timer callbacks cannot restart stopped task', () => {
  const timers = fakeTimers()
  const lifecycle = createPollingLifecycle(timers)
  let called = false
  lifecycle.schedule(() => { called = true }, 1000)
  const stored = [...timers.queued.values()][0].callback
  lifecycle.stop()
  stored() // simulate the callback racing cancellation
  assert.equal(called, false)
})
