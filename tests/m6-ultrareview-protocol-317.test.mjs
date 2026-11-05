import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { parseReviewRequest } from '../src/commands/reviewMode.ts'

test('333 深度审查在本地执行，不以官方云端审查协议作为入口', () => {
  assert.deepEqual(parseReviewRequest('deep'), { mode: 'deep', target: '' })
  assert.deepEqual(parseReviewRequest('security 123'), { mode: 'security', target: '123' })
  assert.deepEqual(parseReviewRequest('normal src'), { mode: 'normal', target: 'src' })
  const text = readFileSync(new URL('../src/commands/review.ts', import.meta.url), 'utf8')
  assert.match(text, /审查.*本地|本地.*审查/)
  assert.doesNotMatch(text, /fetchUltrareviewQuota|reviewRemote|https?:\/\/claude\.ai/)
})
