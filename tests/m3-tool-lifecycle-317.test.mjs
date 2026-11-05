import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withToolInProgress, observeToolExecutionPromise } from '../src/services/tools/toolExecutionLifecycle317.mjs'

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

test('2.1.317 streamed tools: settlement is observed once and resumes queued work', async () => {
  const events = []
  const promise = observeToolExecutionPromise(
    Promise.resolve('finished'),
    () => events.push('cleanup'),
    () => events.push('resume'),
    () => events.push('error'),
  )
  assert.equal(await promise, 'finished')
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(events, ['cleanup', 'resume'])
})

test('2.1.317 streamed tools: execution errors propagate, cleanup and block queued work', async () => {
  const events = []
  const failure = new Error('streamed execution failed')
  const promise = observeToolExecutionPromise(
    Promise.reject(failure),
    () => events.push('cleanup'),
    () => events.push('resume'),
    error => {
      assert.equal(error, failure)
      events.push('error')
    },
  )
  await assert.rejects(promise, error => error === failure)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(events, ['cleanup', 'error'])
})

test('2.1.317 streamed tools: cancelling child execution settles and releases active identity', async () => {
  const active = new Set(['tool-1'])
  const controller = new AbortController()
  const execute = new Promise((resolve, reject) =>
    controller.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
  )
  const events = []
  const tracked = observeToolExecutionPromise(
    execute,
    () => { active.delete('tool-1'); events.push('cleanup') },
    () => events.push('resume'),
    () => events.push('cancelled'),
  )
  controller.abort('streaming_fallback')
  await assert.rejects(tracked, /cancelled/)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual([...active], [])
  assert.deepEqual(events, ['cleanup', 'cancelled'])
})
