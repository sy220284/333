import assert from 'node:assert/strict'
import test from 'node:test'
import { findKeywordTriggerPositions } from '../src/utils/ultraplan/keyword.ts'

test('2.1.317 qualified ultrathink keyword triggers a real effort boost', () => {
  const examples = ['please ultrathink', 'ultrathink this', 'ultrathink, please', 'two ultrathink tokens ultrathink']
  for (const sentence of examples) {
    assert.ok(findKeywordTriggerPositions(sentence, 'ultrathink').length >= 1, sentence)
  }
})

test('2.1.317 quoted and path/identifier ultrathink are not effort requests', () => {
  const examples = [
    '`ultrathink`', '"ultrathink"', "'ultrathink'", '<ultrathink>', '[ultrathink]', '(ultrathink)',
    'src/ultrathink/notes.ts', 'ultrathink.ts', 'ultrathink/subdir', 'ultrathink-mode', '--ultrathink',
    '/rename ultrathink notes', 'ultrathink?', 'ultrathink\\file',
  ]
  for (const sentence of examples) {
    assert.deepEqual(findKeywordTriggerPositions(sentence, 'ultrathink'), [], sentence)
  }
})
