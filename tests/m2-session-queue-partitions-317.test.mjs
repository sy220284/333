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

test('cold session reads never allocate partitions across repeated resume cycles', () => {
  const store = new SessionQueuePartitions317()
  const empty = store.snapshot('unopened')
  for (let i = 0; i < 4096; i++) {
    const id = 'resumed-' + i
    assert.equal(store.getExisting(id), undefined)
    assert.strictEqual(store.snapshot(id), empty)
  }
  assert.deepEqual([...store.entries()], [], '4096 idle reads must not retain partitions')
  const entries = store.get('live')
  entries.push({ uuid: 'active' })
  store.changed('live')
  assert.strictEqual(store.getExisting('live'), entries)
  assert.equal([...store.entries()].length, 1)
  entries.pop()
  store.changed('live')
  assert.equal(store.getExisting('live'), undefined)
  assert.deepEqual([...store.entries()], [], 'drained sessions release their partition')
})
