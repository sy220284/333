import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diagnosticSourceLineToken } from '../tools/governance/lint-location.mjs'

test('RDJSON uses 1-based line positions', () => {
  const lines = ['const first = 1', '  const  regex = /x/ ', 'const third = 3']
  assert.equal(diagnosticSourceLineToken(lines, 1), 'const first = 1')
  assert.equal(diagnosticSourceLineToken(lines, 2), 'const regex = /x/')
  assert.equal(diagnosticSourceLineToken(lines, 3), 'const third = 3')
})

test('line numbers outside a source file yield no token', () => {
  const lines = ['first']
  for (const line of [-1, 0, 1.5, 2, null, undefined]) {
    assert.equal(diagnosticSourceLineToken(lines, line), '')
  }
})

test('inserting a comment before the diagnostic preserves its comparison key', () => {
  const baseline = ['first', 'const ESC_RE = /^\\x1b/']
  const modified = ['first', '// new feature description', 'const ESC_RE = /^\\x1b/']
  assert.equal(
    diagnosticSourceLineToken(baseline, 2),
    diagnosticSourceLineToken(modified, 3),
  )
})
