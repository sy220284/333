import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  native317MessagesRequest, native317RequestHeaders, NATIVE_317_API_VERSION,
} from '../src/services/api/native317Wire.mjs'

test('317 SDK compatibility: beta messages uses official resource URI and API-key headers', () => {
  const originalHeaders = new Headers({
    authorization: 'Bearer sk-fixture-317',
    'anthropic-version': '2026-10-21',
    'anthropic-beta': 'claude-code-20250219',
    'x-custom-header': 'preserve',
  })
  const result = native317MessagesRequest(
    'https://api.example.invalid/v1/messages?trace=1',
    { method: 'POST', headers: originalHeaders, body: '{}' },
    { apiKey: 'sk-fixture-317' },
  )
  const url = new URL(result.input)
  assert.equal(url.pathname, '/v1/messages')
  assert.equal(url.searchParams.get('beta'), 'true')
  assert.equal(url.searchParams.get('trace'), '1')
  assert.equal(result.init.headers.get('anthropic-version'), NATIVE_317_API_VERSION)
  assert.equal(result.init.headers.get('x-api-key'), 'sk-fixture-317')
  assert.equal(result.init.headers.get('authorization'), null)
  assert.equal(result.init.headers.get('x-custom-header'), 'preserve')
  assert.equal(originalHeaders.get('authorization'), 'Bearer sk-fixture-317', 'caller headers stay immutable')
})

test('317 SDK compatibility: beta token count follows same official API route', () => {
  const result = native317MessagesRequest(
    'https://api.example.invalid/v1/messages/count_tokens',
    { method: 'POST', headers: { 'anthropic-beta': 'context-management-2025-06-27' } },
  )
  assert.equal(new URL(result.input).search, '?beta=true')
  assert.equal(result.init.headers.get('anthropic-version'), '2023-06-01')
})

test('317 SDK compatibility: OAuth stays Bearer and is not replaced with an API key', () => {
  const result = native317MessagesRequest(
    'https://api.example.invalid/v1/messages',
    { headers: { 'anthropic-beta': 'x', authorization: 'Bearer oauth-user-token' } },
    { apiKey: 'sk-unrelated-key' },
  )
  assert.equal(result.init.headers.get('authorization'), 'Bearer oauth-user-token')
  assert.equal(result.init.headers.get('x-api-key'), null)
})

test('317 SDK compatibility: generic non-beta and non-Messages requests are unchanged', () => {
  for (const url of ['/v1/models', '/v1/messages', '/v1/beta/custom']) {
    const input = 'https://api.example.invalid' + url
    const init = { headers: { authorization: 'Bearer api-key' } }
    const result = native317MessagesRequest(input, init, { apiKey: 'api-key' })
    assert.equal(result.input, input)
    assert.equal(result.init, init)
  }
})

test('317 SDK compatibility: Request inputs preserve POST body and existing query', async () => {
  const request = new Request('https://api.example.invalid/v1/messages?trace=keep', {
    method: 'POST', headers: { 'anthropic-beta': 'x', 'content-type': 'application/json' },
    body: '{"model":"claude-sonnet-4-6"}',
  })
  const result = native317MessagesRequest(request)
  assert.ok(result.input instanceof Request)
  assert.equal(result.input.method, 'POST')
  assert.equal(await result.input.text(), '{"model":"claude-sonnet-4-6"}')
  assert.equal(new URL(result.input.url).searchParams.get('trace'), 'keep')
  assert.equal(new URL(result.input.url).searchParams.get('beta'), 'true')
})

test('317 SDK fetch boundary: Request headers survive without init overrides', () => {
  const request = new Request('https://api.example.invalid/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-beta': 'claude-code-20250219',
      authorization: 'Bearer user-token',
      'x-trace': 'preserved',
    },
    body: '{}',
  })
  const headers = native317RequestHeaders(request)
  assert.equal(headers.get('anthropic-beta'), 'claude-code-20250219')
  assert.equal(headers.get('authorization'), 'Bearer user-token')
  assert.equal(headers.get('x-trace'), 'preserved')
  const transformed = native317MessagesRequest(request, { headers })
  assert.equal(new URL(transformed.input.url).searchParams.get('beta'), 'true')
  assert.equal(transformed.init.headers.get('authorization'), 'Bearer user-token')
})

test('317 SDK fetch boundary: explicit init headers replace Request headers', () => {
  const request = new Request('https://api.example.invalid/v1/messages', {
    headers: { 'anthropic-beta': 'old', 'x-trace': 'request' },
  })
  const headers = native317RequestHeaders(request, {
    headers: { 'anthropic-beta': 'new', 'x-trace': 'init' },
  })
  assert.equal(headers.get('anthropic-beta'), 'new')
  assert.equal(headers.get('x-trace'), 'init')
})
