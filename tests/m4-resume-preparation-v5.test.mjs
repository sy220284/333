import assert from 'node:assert/strict'
import { test } from 'node:test'
import { precomputeResumeCommitV5 } from '../src/utils/resumePreparationV5.mjs'

test('resume precompute keeps exact JSONL path and session identity before side effects', () => {
  const source = [{ uuid: 'user-1', type: 'user' }]
  const prepared = precomputeResumeCommitV5(source, 'session-a', '/worktree-a/session-a.jsonl', undefined)
  assert.equal(prepared.sessionId, 'session-a')
  assert.equal(prepared.fullPath, '/worktree-a/session-a.jsonl')
  assert.deepEqual(prepared.messages, source)
  assert.notStrictEqual(prepared.messages, source)
  source.push({ uuid: 'user-2', type: 'user' })
  assert.equal(prepared.messages.length, 1, 'later loader mutations do not alter the staged list')
})

test('resumed logs use their recorded transcript path, with no invented fallback', () => {
  assert.equal(precomputeResumeCommitV5([], 's', undefined, '/archive/s.jsonl').fullPath, '/archive/s.jsonl')
  assert.equal(precomputeResumeCommitV5([], 's', undefined, undefined).fullPath, undefined)
  assert.throws(() => precomputeResumeCommitV5(null, 's', undefined, undefined), TypeError)
})
