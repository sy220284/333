import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldRetrySessionAppendAfterMkdir } from '../src/utils/sessionWriteFailurePolicy.mjs'

test('2.1.317: missing parent directory may be created and retried', () => {
  assert.equal(shouldRetrySessionAppendAfterMkdir('ENOENT'), true)
})

test('2.1.317: disk full and quota exceeded never trigger a mkdir retry', () => {
  assert.equal(shouldRetrySessionAppendAfterMkdir('ENOSPC'), false)
  assert.equal(shouldRetrySessionAppendAfterMkdir('EDQUOT'), false)
})

test('2.1.317: permission and I/O failures do not get silently retried', () => {
  for (const code of ['EACCES', 'EPERM', 'EIO', undefined]) {
    assert.equal(shouldRetrySessionAppendAfterMkdir(code), false)
  }
})

test('2.1.317: queue write failures are retained and raised on flush', () => {
  const storage = readFileSync(new URL('../src/utils/sessionStorage.ts', import.meta.url), 'utf8')
  assert.match(storage, /private persistenceFailure: Error \| null = null/)
  assert.match(storage, /this\.recordPersistenceFailure\(error\)/)
  assert.match(storage, /this\.throwIfPersistenceFailed\(\)/)
  assert.match(storage, /shouldRetrySessionAppendAfterMkdir\(getErrnoCode\(error\)\)/)
})

test('2.1.317: headless CLI flushes before final result and shows persistence failures', () => {
  const query = readFileSync(new URL('../src/QueryEngine.ts', import.meta.url), 'utf8')
  const cli = readFileSync(new URL('../src/cli/print.ts', import.meta.url), 'utf8')
  assert.match(query, /getIsNonInteractiveSession\(\)/)
  assert.match(query, /await flushSessionStorage\(\)/)
  assert.match(cli, /lastMessage\.errors\.join\('; '\)/)
})
