import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bindSessionId } from '../src/query/sessionIdentity317.mjs'

test('2.1.317 SDK conversation captures its session identity exactly once', () => {
  let current = 'session-a'
  let resolves = 0
  const sessionId = bindSessionId(undefined, () => { resolves++; return current })
  current = 'session-b'
  assert.equal(sessionId, 'session-a')
  assert.equal(resolves, 1)
  assert.equal(bindSessionId('session-c', () => { throw Error('unexpected global lookup') }), 'session-c')
})

test('2.1.317 invalid session identities surface a typed failure', () => {
  assert.throws(() => bindSessionId('', () => 'unused'), TypeError)
  assert.throws(() => bindSessionId(undefined, () => ''), TypeError)
})
