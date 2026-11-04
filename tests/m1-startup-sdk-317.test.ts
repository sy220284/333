import { expect, test } from 'bun:test'
import { buildStartupFailureResult } from '../src/utils/cliStartupFailure.mjs'
import { SDKResultErrorSchema } from '../src/entrypoints/sdk/coreSchemas.js'

test('SDK parser retains the actual 317 startup failure fields', () => {
  const frame = buildStartupFailureResult({ sessionId: '11111111-1111-4111-8111-111111111111', message: 'cwd missing', reason: 'cwd_unavailable' })
  const parsed = SDKResultErrorSchema().parse(frame)
  expect(parsed.startup_failure_reason).toBe('cwd_unavailable')
  expect(parsed.result_index).toBe(0)
  expect(parsed.errors).toEqual(['cwd missing'])
})
