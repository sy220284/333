import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withToolInProgress } from '../src/services/tools/toolExecutionLifecycle317.mjs'

function registry() {
  let active = new Set()
  return {
    set(update) { active = update(active) },
    get ids() { return [...active].sort() },
  }
}

test('2.1.317 tool lifetime: normal completion clears in-progress ID', async () => {
  const state = registry()
  const stream = withToolInProgress(state.set, 'read-1', async function* () {
    yield 'progress'
    yield 'result'
  })
  assert.deepEqual(await stream.next(), { value: 'progress', done: false })
  assert.deepEqual(state.ids, ['read-1'])
  assert.deepEqual(await stream.next(), { value: 'result', done: false })
  assert.equal((await stream.next()).done, true)
  assert.deepEqual(state.ids, [])
})

test('2.1.317 tool lifetime: a rejected execution propagates and clears ID', async () => {
  const state = registry()
  const stream = withToolInProgress(state.set, 'bash-1', async function* () {
    yield 'started'
    throw new Error('tool execution failed')
  })
  await stream.next()
  assert.deepEqual(state.ids, ['bash-1'])
  await assert.rejects(stream.next(), /tool execution failed/)
  assert.deepEqual(state.ids, [])
})

test('2.1.317 tool lifetime: cancellation clears only the affected concurrent ID', async () => {
  const state = registry()
  const run = id => withToolInProgress(state.set, id, async function* () {
    yield id
    yield 'done'
  })
  const a = run('read-1'), b = run('read-2')
  await Promise.all([a.next(), b.next()])
  assert.deepEqual(state.ids, ['read-1', 'read-2'])
  await a.return()
  assert.deepEqual(state.ids, ['read-2'])
  await b.next()
  await b.next()
  assert.deepEqual(state.ids, [])
})

test('2.1.317 tool lifetime: setup failure does not leave an active ID', async () => {
  const state = registry()
  const stream = withToolInProgress(state.set, 'invalid-1', () => {
    throw new Error('could not initialize')
  })
  await assert.rejects(stream.next(), /could not initialize/)
  assert.deepEqual(state.ids, [])
})
