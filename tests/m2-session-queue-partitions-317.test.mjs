import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SessionQueuePartitions317 } from '../src/utils/sessionQueuePartitions317.mjs'

test('session queues isolate commands and preserve immutable React snapshots', () => {
  const store = new SessionQueuePartitions317()
  const a = { uuid: 'a', priority: 'later' }
  const b = { uuid: 'b', priority: 'now' }
  store.get('session-a').push(a)
  store.changed('session-a')
  const first = store.snapshot('session-a')
  store.get('session-b').push(b)
  store.changed('session-b')
  assert.deepEqual(store.snapshot('session-a'), [a])
  assert.deepEqual(store.snapshot('session-b'), [b])
  assert.ok(Object.isFrozen(first))
  store.get('session-a').pop()
  store.changed('session-a')
  assert.deepEqual(store.snapshot('session-a'), [])
  assert.deepEqual(store.snapshot('session-b'), [b])
  assert.deepEqual(first, [a])
})

test('partition references survive unrelated session mutations and reset releases one session', () => {
  const store = new SessionQueuePartitions317()
  const command = { uuid: 'first' }
  store.get('one').push(command)
  store.changed('one')
  const first = store.snapshot('one')
  store.get('two').push({ uuid: 'second' })
  store.changed('two')
  assert.strictEqual(store.snapshot('one'), first)
  assert.deepEqual([...store.entries()].map(([id]) => id), ['one', 'two'])
  store.reset('one')
  assert.deepEqual(store.snapshot('one'), [])
  assert.equal(store.get('two')[0].uuid, 'second')
})
