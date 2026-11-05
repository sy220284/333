import { expect, test } from 'bun:test'
import {
  SDKControlRequestInnerSchema,
  StdinMessageSchema,
} from '../src/entrypoints/sdk/controlSchemas.js'

const validRequests = [
  { subtype: 'end_session', reason: 'user_requested' },
  { subtype: 'channel_enable', serverName: 'messages' },
  { subtype: 'mcp_authenticate', serverName: 'filesystem' },
  {
    subtype: 'mcp_oauth_callback_url',
    serverName: 'remote-mcp',
    callbackUrl: 'http://127.0.0.1:4444/callback?code=a',
  },
  { subtype: 'claude_authenticate', loginWithClaudeAi: true },
  { subtype: 'claude_oauth_callback', authorizationCode: 'abc', state: 'xyz' },
  { subtype: 'claude_oauth_wait_for_completion' },
  { subtype: 'mcp_clear_auth', serverName: 'remote-mcp' },
  { subtype: 'generate_session_title', description: 'A sample session', persist: true },
  { subtype: 'side_question', question: 'Which function calls this?' },
  { subtype: 'remote_control', enabled: false },
]

for (const request of validRequests) {
  test(`SDK accepts and preserves control request ${request.subtype}`, () => {
    const parsed = SDKControlRequestInnerSchema().safeParse(request)
    expect(parsed.success).toBe(true)
    if (!parsed.success) throw parsed.error
    expect(parsed.data).toEqual(request)

    const envelope = {
      type: 'control_request',
      request_id: `test-${request.subtype}`,
      request,
    }
    const input = StdinMessageSchema().safeParse(envelope)
    expect(input.success).toBe(true)
    if (!input.success) throw input.error
    expect(input.data).toEqual(envelope)
  })
}

test('SDK rejects remote control without an explicit enabled state', () => {
  expect(
    SDKControlRequestInnerSchema().safeParse({ subtype: 'remote_control' }).success,
  ).toBe(false)
})

test('SDK rejects an MCP authentication request without its server identity', () => {
  expect(
    SDKControlRequestInnerSchema().safeParse({ subtype: 'mcp_authenticate' }).success,
  ).toBe(false)
})

test('SDK rejects an OAuth callback without the authorization code', () => {
  expect(
    SDKControlRequestInnerSchema().safeParse({
      subtype: 'claude_oauth_callback',
      state: 'present',
    }).success,
  ).toBe(false)
})
