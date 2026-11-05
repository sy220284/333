import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'bun:test'
import {
  getSessionId,
  regenerateSessionId,
  switchSession,
  getParentSessionId,
  getSessionProjectDir,
  getLastMainRequestId,
  setLastMainRequestId,
  getLastApiCompletionTimestamp,
  setLastApiCompletionTimestamp,
  markPostCompaction,
  consumePostCompaction,
} from '../src/bootstrap/state.ts'
import { asSessionId } from '../src/types/ids.ts'

test('2.1.317 changing session IDs isolates the outgoing request journal', () => {
  const original = getSessionId()
  const newId = asSessionId(randomUUID())
  try {
    setLastMainRequestId('request-old')
    setLastApiCompletionTimestamp(123456)
    markPostCompaction()
    regenerateSessionId({setCurrentAsParent:true})
    assert.equal(getParentSessionId(), original)
    switchSession(newId, '/new/worktree')
    assert.equal(getSessionId(), newId)
    assert.equal(getSessionProjectDir(), '/new/worktree')
    assert.equal(getParentSessionId(), undefined)
    assert.equal(getLastMainRequestId(), undefined)
    assert.equal(getLastApiCompletionTimestamp(), null)
    assert.equal(consumePostCompaction(), false)
  } finally {
    switchSession(original)
  }
})

test('2.1.317 changing only the same-session project owner preserves its request', () => {
  const original = getSessionId()
  try {
    setLastMainRequestId('request-in-flight')
    setLastApiCompletionTimestamp(123)
    markPostCompaction()
    switchSession(original, '/resumed/worktree')
    assert.equal(getSessionId(), original)
    assert.equal(getSessionProjectDir(), '/resumed/worktree')
    assert.equal(getLastMainRequestId(), 'request-in-flight')
    assert.equal(getLastApiCompletionTimestamp(), 123)
    assert.equal(consumePostCompaction(), true)
  } finally {
    switchSession(original)
  }
})

test('2.1.317 regenerated conversations retain lineage only when explicitly requested', () => {
  const original = getSessionId()
  try {
    setLastMainRequestId('before-clear')
    markPostCompaction()
    const fresh = regenerateSessionId({setCurrentAsParent:true})
    assert.equal(getParentSessionId(), original)
    assert.notEqual(fresh, original)
    assert.equal(getLastMainRequestId(), undefined)
    assert.equal(consumePostCompaction(), false)
    const newer = regenerateSessionId()
    assert.equal(getSessionId(), newer)
    assert.equal(getParentSessionId(), undefined)
    assert.notEqual(newer, fresh)
  } finally {
    switchSession(original)
  }
})
