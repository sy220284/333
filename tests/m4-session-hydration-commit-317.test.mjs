import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commitRestoredSession } from '../src/utils/sessionHydrationCommit317.mjs'

test('CCR restore: active session changes only after the transcript is safely published', async () => {
  const history = []
  let sessionId = 'original-session'
  await commitRestoredSession(
    async () => {
      history.push('write-start')
      assert.equal(sessionId, 'original-session')
      await Promise.resolve()
      history.push('write-finished')
    },
    () => {
      history.push('activate')
      sessionId = 'resumed-session'
    },
  )
  assert.deepEqual(history, ['write-start','write-finished','activate'])
  assert.equal(sessionId, 'resumed-session')
})

test('CCR restore: failed disk write leaves the current session unchanged', async () => {
  let sessionId = 'original-session'
  const failure = new Error('disk quota exceeded')
  await assert.rejects(commitRestoredSession(
    async () => { throw failure },
    () => { sessionId = 'resumed-session' },
  ), error => error === failure)
  assert.equal(sessionId, 'original-session')
})
