import test from 'node:test'
import './m1-post-compact-read-paths-317.test.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const readSource = readFileSync(new URL('../src/tools/FileReadTool/FileReadTool.ts', import.meta.url), 'utf8')
const readPrompt = readFileSync(new URL('../src/tools/FileReadTool/prompt.ts', import.meta.url), 'utf8')
const readUI = readFileSync(new URL('../src/tools/FileReadTool/UI.tsx', import.meta.url), 'utf8')

test('2.1.317: Read no longer exposes a file_unchanged output or early return', () => {
  assert.doesNotMatch(readSource, /file_unchanged|tengu_read_dedup|dedupKillswitch/)
  assert.match(readSource, /return await callInner\(/)
})

test('2.1.317: obsolete Read stub is absent from API mapping, tool prompt and UI', () => {
  assert.doesNotMatch(readSource, /FILE_UNCHANGED_STUB|seededFileUnchangedMessage/)
  assert.doesNotMatch(readPrompt, /FILE_UNCHANGED_STUB|seededFileUnchangedMessage/)
  assert.doesNotMatch(readUI, /file_unchanged|Unchanged since last read/)
})
