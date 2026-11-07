import { expect, test } from 'bun:test'
import { PermissionUpdateSchema, HookJSONOutputSchema } from '../src/entrypoints/sdk/coreSchemas.js'
import { permissionUpdateSchema } from '../src/utils/permissions/PermissionUpdateSchema.js'
import type { PermissionUpdate } from '../src/types/permissions.js'

test('本地权限更新与 SDK 2.1.317 使用相同解析器及 auto 模式契约', () => {
  expect(permissionUpdateSchema).toBe(PermissionUpdateSchema)
  const update: PermissionUpdate = { type: 'setMode', mode: 'auto', destination: 'session' }
  expect(permissionUpdateSchema().parse(update)).toEqual(update)
  expect(HookJSONOutputSchema().parse({
    hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: {
      behavior: 'allow', updatedPermissions: [update],
    } },
  })).toMatchObject({ hookSpecificOutput: { decision: { updatedPermissions: [update] } } })
  expect(permissionUpdateSchema().safeParse({ ...update, mode: 'bubble' }).success).toBe(false)
})

test('SDK 权限建议保持规则结构与原始更新目的地', () => {
  const update: PermissionUpdate = {
    type: 'addRules', destination: 'projectSettings', behavior: 'ask',
    rules: [{toolName: 'Bash', ruleContent: 'git status'}],
  }
  expect(permissionUpdateSchema().parse(update)).toEqual(update)
  expect(PermissionUpdateSchema().parse(update)).toEqual(update)
})
