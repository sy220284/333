import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SessionTranscriptPathsV5 } from '../src/utils/sessionTranscriptPathsV5.mjs'

test('Storage V5 routes async writes back to the original resumed worktree', () => {
  const paths = new SessionTranscriptPathsV5()
  paths.remember('session-a', '/worktree-a/claude/session-a.jsonl')
  paths.remember('session-b', '/worktree-b/claude/session-b.jsonl')
  assert.equal(paths.resolve('session-a', () => '/wrong/session-a.jsonl'), '/worktree-a/claude/session-a.jsonl')
  assert.equal(paths.resolve('session-b', () => '/wrong/session-b.jsonl'), '/worktree-b/claude/session-b.jsonl')
})

test('Storage V5 remembers explicit relocation, while unknown sessions use their default path', () => {
  const paths = new SessionTranscriptPathsV5()
  assert.equal(paths.resolve('legacy', () => '/default/legacy.jsonl'), '/default/legacy.jsonl')
  paths.remember('legacy', '/resume/legacy.jsonl')
  paths.remember('legacy', '/moved/legacy.jsonl')
  assert.equal(paths.resolve('legacy', () => '/default/legacy.jsonl'), '/moved/legacy.jsonl')
  assert.throws(() => paths.remember('legacy', ''), TypeError)
})
