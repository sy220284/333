import { expect, test } from 'bun:test'
import type { SDKResultMessage } from '../src/entrypoints/sdk/coreTypes.js'
import { convertSDKMessage, getResultText, isSuccessResult } from '../src/remote/sdkMessageAdapter.js'

const result = {
  type: 'result',
  subtype: 'success',
  is_error: true,
  terminal_reason: 'api_error',
  duration_ms: 1,
  duration_api_ms: 0,
  num_turns: 1,
  stop_reason: null,
  total_cost_usd: 0,
  result: 'Not logged in',
  errors: ['Not logged in'],
  session_id: 'test',
  uuid: '00000000-0000-4000-8000-000000000001',
  permission_denials: [],
  modelUsage: {},
  usage: { input_tokens: 0, output_tokens: 0 },
} as unknown as SDKResultMessage

test('official SDK success subtype carrying an API error remains a failed result', () => {
  expect(isSuccessResult(result)).toBe(false)
  expect(getResultText(result)).toBeNull()
  const converted = convertSDKMessage(result)
  expect(converted.type).toBe('message')
  if (converted.type === 'message') {
    expect(converted.message.type).toBe('system')
    if (converted.message.type === 'system') {
      expect(converted.message.level).toBe('warning')
      expect(converted.message.content).toContain('Not logged in')
    }
  }
})
