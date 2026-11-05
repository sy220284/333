import { expect, test } from 'bun:test'
import { countLinesChanged, getPatchFromContents } from '../src/utils/diff.js'
import { execSyncWithDefaults_DEPRECATED } from '../src/utils/execFileNoThrowPortable.js'

test('normal shell stdout remains text and nonzero results do not masquerade as output', () => {
  expect(execSyncWithDefaults_DEPRECATED('echo 333-runtime-output')).toBe('333-runtime-output')
  expect(execSyncWithDefaults_DEPRECATED('echo 333-hidden-output', {
    stdio: ['ignore', 'ignore', 'pipe'],
  })).toBeNull()
})

test('real text diffs count changes without relying on unchecked unknown values', () => {
  const patch = getPatchFromContents({
    filePath: 'example.txt',
    oldContent: 'before\n',
    newContent: 'after\n',
  })
  expect(patch.length).toBeGreaterThan(0)
  expect(patch.flatMap(hunk => hunk.lines).some(line => line === '-before')).toBe(true)
  expect(patch.flatMap(hunk => hunk.lines).some(line => line === '+after')).toBe(true)
  expect(() => countLinesChanged(patch)).not.toThrow()
})

test('malformed diff lines produce an explicit error instead of an invalid line count', () => {
  const patch = getPatchFromContents({
    filePath: 'example.txt',
    oldContent: 'old\n',
    newContent: 'new\n',
  })
  expect(patch.length).toBeGreaterThan(0)
  const first = patch[0]
  if (!first) throw new Error('diff should contain one hunk')
  const broken = [{ ...first, lines: [undefined] }] as unknown as typeof patch
  expect(() => countLinesChanged(broken)).toThrow(/Invalid diff patch/)
})
