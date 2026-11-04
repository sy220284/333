import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { collectPreservedReadFilePaths, hasFullReadResultContent } from '../src/services/compact/preservedReadPaths.mjs'

const normalize = path => path.startsWith('/') ? path : `/repo/${path}`
const read = (id, file_path) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id, name: 'Read', input: { file_path } }] },
})
const result = (id, content = 'file content', is_error = false) => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error }] },
})
const preserved = messages => collectPreservedReadFilePaths(messages, 'Read', normalize)

test('2.1.317 compact: successful preserved Read prevents duplicate restoration', () => {
  assert.deepEqual([...preserved([read('r1', 'src/file.ts'), result('r1')])], ['/repo/src/file.ts'])
  assert.deepEqual([...preserved([
    read('r1', 'src/file.ts'), result('r1'),
    read('r2', './other.ts'), result('r2'),
  ])], ['/repo/src/file.ts', '/repo/./other.ts'])
})

test('2.1.317 compact: interrupted or failed Read must be restored', () => {
  assert.equal(preserved([read('r1', 'src/file.ts')]).size, 0)
  assert.equal(preserved([read('r1', 'src/file.ts'), result('r1', 'permission denied', true)]).size, 0)
  assert.equal(preserved([read('r1', 'src/file.ts'), result('unrelated')]).size, 0)
})

test('2.1.317 compact: only Read results count; empty files and multimodal results count', () => {
  const messages = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { file_path: '/bash' } }] } },
    result('b1'),
    read('empty', '/empty.txt'), result('empty', ''),
    read('image', '/image.png'), result('image', [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } }]),
  ]
  assert.deepEqual([...preserved(messages)], ['/empty.txt', '/image.png'])
})

test('2.1.317 compact: cleared and persisted pointers are not full Read results', () => {
  const cleared = '[Old tool result content cleared]'
  const persisted = '<persisted-output>run-42'
  const provenance = '<artifact-content-authored-by-others/>\n'
  const fullResult = block => {
    if (typeof block.content !== 'string') return true
    const content = block.content.startsWith(provenance)
      ? block.content.slice(provenance.length)
      : block.content
    return content !== cleared && !content.startsWith('<persisted-output>')
  }
  const check = content => collectPreservedReadFilePaths(
    [read('r', '/doc.md'), result('r', content)],
    'Read',
    normalize,
    fullResult,
  )
  assert.equal(check(cleared).size, 0)
  assert.equal(check(provenance + cleared).size, 0)
  assert.equal(check(persisted).size, 0)
  assert.equal(check(provenance + persisted).size, 0)
  assert.equal(hasFullReadResultContent(
    result('r', provenance + cleared).message.content[0],
    cleared, '<persisted-output>', provenance,
  ), false)
  assert.equal(hasFullReadResultContent(
    result('r', 'full file text').message.content[0],
    cleared, '<persisted-output>', provenance,
  ), true)
  assert.equal(check('full file text').size, 1)
  assert.equal(check('').size, 1)
})

test('2.1.317 compact: transcript reconstruction shares the Read result guard', () => {
  const source = readFileSync(new URL('../src/utils/queryHelpers.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /FILE_UNCHANGED_STUB/)
  assert.match(source, /hasFullReadResultContent\(/)
})

test('2.1.317 compact: no legacy stub references remain', () => {
  const compact = readFileSync(new URL('../src/services/compact/compact.ts', import.meta.url), 'utf8')
  const prompt = readFileSync(new URL('../src/tools/FileReadTool/prompt.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(compact, /FILE_UNCHANGED_STUB|stubIds|collectReadToolFilePaths/)
  assert.doesNotMatch(prompt, /FILE_UNCHANGED_STUB/)
  assert.ok(compact.includes('collectPreservedReadFilePaths('))
})
