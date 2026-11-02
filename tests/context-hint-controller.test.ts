import { describe, expect, test } from 'bun:test'
import type { Message } from '../src/types/message.js'
import {
  CONTEXT_HINT_BETA,
  createContextHintController,
} from '../src/services/api/contextHintController.js'

const base = {
  enabled: true,
  firstParty: true,
  querySource: 'repl_main_thread',
  compactableTools: new Set(['Read']),
  estimateTextTokens: (s: string) => s.length,
}
function sample(): Message[] {
  const result: unknown[] = []
  for (let i = 0; i < 7; i++) {
    result.push({
      type: 'assistant', uuid: `as-${i}`, timestamp: '',
      message: { content: [{ type: 'tool_use', name: 'Read', id: `r-${i}`, input: {} }] },
    })
    result.push({
      type: 'user', uuid: `u-${i}`, timestamp: '',
      message: { content: [{ type: 'tool_result', tool_use_id: `r-${i}`, content: 'a'.repeat(11_000) }] },
    })
  }
  return result as Message[]
}

describe('context_hint request and recovery', () => {
  test('only first-party main thread receives the beta', () => {
    expect(createContextHintController({ ...base, firstParty: false })).toBeNull()
    expect(createContextHintController({ ...base, querySource: 'agent:default' })).toBeNull()
    expect(createContextHintController({ ...base, enabled: false })!.buildRequestParams(sample())).toBeNull()
    const c = createContextHintController(base)!
    expect(c.buildRequestParams(sample())).toEqual({
      beta: CONTEXT_HINT_BETA,
      body: { context_hint: { enabled: true, target_tokens_saved: 75_000 } },
    })
  })

  test.each([422, 424])('HTTP %i reclaims old tool results, then disables hint once', async status => {
    const c = createContextHintController(base)!
    c.buildRequestParams(sample())
    const recovered = await c.onRequestError({ status }, sample())
    expect(recovered?.clearedIds.size).toBe(2)
    expect(recovered?.tokensSaved).toBe(22_000)
    expect(c.buildRequestParams(sample())).toBeNull()
    expect(await c.onRequestError({ status }, sample())).toBeNull()
  })

  test('unrecognized beta 400 retries without deleting user data', async () => {
    const c = createContextHintController(base)!
    const original = sample()
    c.buildRequestParams(original)
    const recovered = await c.onRequestError({ status: 400, message: 'Unexpected value in anthropic-beta' }, original)
    expect(recovered?.messages).toBe(original)
    expect(recovered?.clearedIds.size).toBe(0)
    expect(c.buildRequestParams(original)).toBeNull()
  })

  test('409 and 529 disable hint but follow their own retry semantics', async () => {
    const c = createContextHintController({ ...base, is529Error: e => e.status === 529 })!
    c.buildRequestParams(sample())
    expect(await c.onRequestError({ status: 409 }, sample())).toBeNull()
    expect(c.buildRequestParams(sample())).toBeNull()
    const c2 = createContextHintController({ ...base, is529Error: e => e.status === 529 })!
    c2.buildRequestParams(sample())
    expect(await c2.onRequestError({ status: 529 }, sample())).toBeNull()
    expect(c2.buildRequestParams(sample())).toBeNull()
  })

  test('only eligible invalid_request_error without HTTP status is a stream fallback', async () => {
    const c = createContextHintController(base)!
    c.buildRequestParams(sample())
    expect(c.classifyStreamError({ status: 400, error: { error: { type: 'invalid_request_error' } } })).toBe(false)
    expect(c.classifyStreamError({ error: { error: { type: 'invalid_request_error' } } })).toBe(true)
    const recovered = await c.onStreamFallback(sample())
    expect(recovered?.clearedIds.size).toBe(2)
    expect(await c.onStreamFallback(sample())).toBeNull()
  })
})
