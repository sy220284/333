import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRemotePollingRegistry } from '../src/utils/task/remotePollingRegistry317.mjs'

test('317 kill() releases registered timer exactly once', () => {
  const registry = createRemotePollingRegistry()
  let stops = 0
  const cleanup = registry.register('task-1', () => { stops++ })
  assert.equal(registry.has('task-1'), true)
  registry.stop('task-1')
  assert.equal(stops, 1)
  assert.equal(registry.has('task-1'), false)
  registry.stop('task-1')
  assert.equal(stops, 1)
  cleanup()
  assert.equal(stops, 2)
})

test('317 restarting remote poller cancels old timer and owns new cleanup', () => {
  const registry = createRemotePollingRegistry()
  const stopped = []
  const oldCleanup = registry.register('task-1', () => stopped.push('old'))
  const newCleanup = registry.register('task-1', () => stopped.push('new'))
  assert.deepEqual(stopped, ['old'])
  assert.equal(registry.has('task-1'), true)
  oldCleanup() // Late cleanup from an old poll must not unregister replacement.
  assert.equal(registry.has('task-1'), true)
  newCleanup()
  assert.equal(registry.has('task-1'), false)
  assert.deepEqual(stopped, ['old', 'old', 'new'])
})

test('317 two remote tasks have independent stop lifecycles', () => {
  const registry = createRemotePollingRegistry()
  const calls = []
  registry.register('a', () => calls.push('a'))
  registry.register('b', () => calls.push('b'))
  registry.stop('a')
  assert.deepEqual(calls, ['a'])
  assert.equal(registry.has('b'), true)
  registry.stop('b')
  assert.deepEqual(calls, ['a', 'b'])
})
