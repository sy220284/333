import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  extractTag, textOfReviewEvent, extractLatestRemoteReview,
  formatRemoteReviewFindings, REMOTE_REVIEW_TAG,
} from '../src/cli/handlers/ultrareviewProtocol.mjs'

test('2.1.317 review protocol returns the latest tagged result from hook stdout', () => {
  const events = [
    { type: 'system', subtype: 'hook_progress', stdout: '<remote-review>[{"file_path":"old.ts"}]</remote-review>' },
    { type: 'system', subtype: 'hook_response', stdout: '<remote-review>[]</remote-review>' },
  ]
  assert.equal(extractLatestRemoteReview(events), '[]')
})
test('2.1.317 review protocol assembles large split hook output', () => {
  const events = [
    { type: 'system', subtype: 'hook_progress', stdout: '<remote-re' },
    { type: 'system', subtype: 'hook_response', stdout: 'view>[]</remote-review>' },
  ]
  assert.equal(extractLatestRemoteReview(events), '[]')
})
test('2.1.317 review protocol extracts assistant text and ignores untagged progress', () => {
  const events = [
    { type: 'assistant', message: { content: [{ type: 'text', text: 'still reviewing' }] } },
    { type: 'assistant', message: { content: [{ type: 'text', text: '<remote-review>[]</remote-review>' }] } },
  ]
  assert.equal(extractLatestRemoteReview(events), '[]')
  assert.equal(extractLatestRemoteReview(events.slice(0, 1)), undefined)
  assert.equal(textOfReviewEvent(events[0]), 'still reviewing')
})
test('2.1.317 review protocol prevents a malformed close tag from ending review early', () => {
  assert.equal(extractTag('</remote-review> invalid', REMOTE_REVIEW_TAG), undefined)
  assert.equal(extractTag('<remote-review>[]', REMOTE_REVIEW_TAG), undefined)
})
test('2.1.317 empty findings and raw non-JSON outcomes are distinguished', () => {
  assert.equal(formatRemoteReviewFindings('[]'), 'Review complete — no findings.')
  assert.equal(formatRemoteReviewFindings('not-json'), 'not-json')
  assert.equal(formatRemoteReviewFindings('{}'), '{}')
})
test('2.1.317 severity and file line span text match the native review format', () => {
  assert.equal(formatRemoteReviewFindings(JSON.stringify([{
    severity: 'nit', file_path: 'src/main.ts', start_line: 12,
    end_line: 13, pr_comment: 'Fix one thing.\n\nExplain why.',
  }])), 'Review complete — 1 finding\n\n🟡 src/main.ts:12-13\nFix one thing.\n\nExplain why.')
  assert.equal(formatRemoteReviewFindings(JSON.stringify([
    { file_path: 'a.ts', start_line: 5, pr_comment: 'A' },
    { severity: 'pre_existing', file_path: 'b.ts', start_line: 6, pr_comment: 'B' },
  ])), 'Review complete — 2 findings\n\n🔴 a.ts:5\nA\n\n🟣 b.ts:6\nB')
})
