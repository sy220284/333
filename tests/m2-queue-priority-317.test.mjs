import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QUEUE_PRIORITY_ORDER, sortQueuedCommandsByPriority } from '../src/utils/queuePriority317.mjs'

test('2.1.317 queue: now before next before later, FIFO within each class', () => {
  assert.deepEqual(QUEUE_PRIORITY_ORDER, { now: 0, next: 1, later: 2 })
  const commands = [
    { id: 'later-1', priority: 'later' },
    { id: 'next-1', priority: 'next' },
    { id: 'now-1', priority: 'now' },
    { id: 'later-2', priority: 'later' },
    { id: 'default-next' },
    { id: 'now-2', priority: 'now' },
  ]
  const sorted = sortQueuedCommandsByPriority(commands)
  assert.deepEqual(sorted.map(c => c.id), [
    'now-1', 'now-2', 'next-1', 'default-next', 'later-1', 'later-2',
  ])
  assert.deepEqual(commands.map(c => c.id), [
    'later-1', 'next-1', 'now-1', 'later-2', 'default-next', 'now-2',
  ])
  for (const command of sorted) {
    assert.ok(commands.includes(command), 'preserve command object identity for queue removal')
  }
})

test('2.1.317 queue: empty input and equal-priority ordering are stable', () => {
  assert.deepEqual(sortQueuedCommandsByPriority([]), [])
  const a = { priority: 'now' }
  const b = { priority: 'now' }
  const c = { priority: 'later' }
  assert.deepEqual(sortQueuedCommandsByPriority([c, b, a]), [b, a, c])
})
