import { test, expect } from 'bun:test'
import { canSelectImplicitAutoMode } from '../src/utils/permissions/permissionSetup.ts'

test('317 implicit auto permission follows rollout consent and remote boundaries', () => {
  expect(canSelectImplicitAutoMode('enabled', false)).toBe(true)
  expect(canSelectImplicitAutoMode(undefined, false)).toBe(true)
  expect(canSelectImplicitAutoMode('disabled', false)).toBe(false)
  expect(canSelectImplicitAutoMode('opt-in', false)).toBe(false)
  expect(canSelectImplicitAutoMode('enabled', true)).toBe(false)
  expect(canSelectImplicitAutoMode(undefined, true)).toBe(false)
  expect(canSelectImplicitAutoMode('opt-in', true)).toBe(false)
})
