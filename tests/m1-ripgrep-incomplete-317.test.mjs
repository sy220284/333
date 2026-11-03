import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifyRipgrepFailure } from '../src/utils/ripgrepResultPolicy.mjs'

test('2.1.317: timeout with partially found files is incomplete', () => {
  assert.deepEqual(classifyRipgrepFailure({
    isTimeout: true,
    isBufferOverflow: false,
    wasAborted: false,
    partialResults: ['src/a.ts', 'src/b.ts'],
  }), {
    kind: 'timeout',
    message: 'Ripgrep search exceeded its time limit after finding 2 partial result(s). The result set is incomplete. Narrow the path or pattern and retry.',
  })
})

test('2.1.317: timeout without any matches is still incomplete', () => {
  assert.equal(classifyRipgrepFailure({
    isTimeout: true, isBufferOverflow: false, wasAborted: false, partialResults: [],
  }).kind, 'timeout')
})

test('2.1.317: output buffer failure with partial matches is incomplete', () => {
  const result = classifyRipgrepFailure({
    isTimeout: false, isBufferOverflow: true, wasAborted: false,
    partialResults: ['/tmp/a.ts'],
  })
  assert.equal(result.kind, 'incomplete')
  assert.match(result.message, /buffer limit/)
})

test('2.1.317: ordinary ripgrep error is never a successful empty match set', () => {
  const result = classifyRipgrepFailure({
    isTimeout: false, isBufferOverflow: false, wasAborted: false, partialResults: [],
  })
  assert.equal(result.kind, 'incomplete')
})

test('2.1.317: caller-driven cancellation remains distinct from timeout', () => {
  assert.equal(classifyRipgrepFailure({
    isTimeout: true, isBufferOverflow: false, wasAborted: true, partialResults: ['a'],
  }).kind, 'cancelled')
})

test('shared ripgrep implementation propagates incomplete results as errors to Grep and Glob', () => {
  const rg = readFileSync(new URL('../src/utils/ripgrep.ts', import.meta.url), 'utf8')
  const grep = readFileSync(new URL('../src/tools/GrepTool/GrepTool.ts', import.meta.url), 'utf8')
  const glob = readFileSync(new URL('../src/utils/glob.ts', import.meta.url), 'utf8')
  assert.match(rg, /classifyRipgrepFailure\(/)
  assert.match(rg, /reject\(new RipgrepTimeoutError\(failure\.message, lines\)\)/)
  assert.match(rg, /reject\(new RipgrepIncompleteError\(failure\.message, lines\)\)/)
  assert.match(grep, /await ripGrep\(/)
  assert.match(glob, /await ripGrep\(/)
})
