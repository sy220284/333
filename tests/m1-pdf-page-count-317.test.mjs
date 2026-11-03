import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { parsePdfInfoPageCount } from '../src/utils/pdfPageCount.mjs'

test('2.1.317: ordinary pdfinfo page count remains correct', () => {
  assert.equal(parsePdfInfoPageCount('Title: Example\nPages: 12\nPage size: 612 x 792 pts\n'), 12)
})

test('2.1.317: hostile PDF title with injected Pages cannot undercount', () => {
  const output = 'Title: Invoice\nPages: 1\nCreator: External PDF\nPages: 100\nPage size: 595 x 842 pts\n'
  assert.equal(parsePdfInfoPageCount(output), 100)
})

test('2.1.317: multiple distinct counts never permit a lower count', () => {
  assert.equal(parsePdfInfoPageCount('Pages: 250\nPages: 3\n'), 250)
})

test('invalid output does not claim an incorrect page count', () => {
  for (const output of ['', 'Pages: -10\n', 'Pages: 0\n', 'Pages: not-a-number\n']) {
    assert.equal(parsePdfInfoPageCount(output), null)
  }
})

test('malformed metadata cannot inject a partial numeric match', () => {
  assert.equal(parsePdfInfoPageCount('Title: X\nPages: 1oops\nPages: 21\n'), 21)
})

test('Read and @-attachments share the canonical PDF page count helper', () => {
  const pdf = readFileSync(new URL('../src/utils/pdf.ts', import.meta.url), 'utf8')
  const read = readFileSync(new URL('../src/tools/FileReadTool/FileReadTool.ts', import.meta.url), 'utf8')
  const attachment = readFileSync(new URL('../src/utils/attachments.ts', import.meta.url), 'utf8')
  assert.match(pdf, /return parsePdfInfoPageCount\(stdout\)/)
  assert.match(read, /getPDFPageCount\(/)
  assert.match(attachment, /getPDFPageCount/)
})
