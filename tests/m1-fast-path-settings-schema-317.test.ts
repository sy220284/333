import { test, expect } from 'bun:test'
import { SettingsSchema } from '../src/utils/settings/types.js'
import { checkRequiredFastPathVersion317 } from '../src/bootstrap/fastPathSettings317.ts'

test('317 organization version limits survive real Zod settings parsing', () => {
  const source = SettingsSchema().parse({
    requiredMinimumVersion: '2.1.318',
    requiredMaximumVersion: '2.1.400',
    minimumVersion: '2.1.100',
  })
  expect(source.requiredMinimumVersion).toBe('2.1.318')
  expect(source.requiredMaximumVersion).toBe('2.1.400')
  expect(source.minimumVersion).toBe('2.1.100')
  expect(checkRequiredFastPathVersion317('2.1.317', source)).toContain(
    'older than the minimum version required by your organization',
  )
})

test('317 organization limits are separate from updater preference', () => {
  const source = SettingsSchema().parse({ minimumVersion: '9.9.9' })
  expect(checkRequiredFastPathVersion317('2.1.317', source)).toBe(null)
})

test('317 rejects malformed managed version types at schema validation', () => {
  expect(SettingsSchema().safeParse({ requiredMinimumVersion: 123 }).success).toBe(false)
  expect(SettingsSchema().safeParse({ requiredMaximumVersion: false }).success).toBe(false)
})
