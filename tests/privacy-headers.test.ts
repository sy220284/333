import assert from 'node:assert/strict'
import test from 'node:test'
import { stripSdkDiagnosticHeaders } from '../src/services/api/privacyHeaders.ts'

test('SDK runtime and platform fingerprint headers are filtered without changing model authentication', () => {
  const headers = new Headers({
    'x-stainless-os': 'Linux',
    'x-stainless-arch': 'x64',
    'x-stainless-runtime': 'node',
    'x-stainless-runtime-version': '26',
    'x-stainless-package-version': '1.5.0',
    'x-stainless-retry-count': '1',
    'authorization': 'Bearer expected-token',
    'anthropic-beta': 'prompt-caching',
    'anthropic-version': '2023-06-01',
    'x-api-key': 'test-secret',
    'x-user-custom': 'preserve',
  })
  stripSdkDiagnosticHeaders(headers)
  assert.equal([...headers.keys()].filter(key => key.startsWith('x-stainless-')).length, 0)
  assert.equal(headers.get('authorization'), 'Bearer expected-token')
  assert.equal(headers.get('anthropic-beta'), 'prompt-caching')
  assert.equal(headers.get('anthropic-version'), '2023-06-01')
  assert.equal(headers.get('x-api-key'), 'test-secret')
  assert.equal(headers.get('x-user-custom'), 'preserve')
})
