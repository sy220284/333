import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { shouldRejectOutOfScopeWrite } from '../src/utils/permissions/writeScopePolicy.mjs'

const source = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('2.1.314 confinement is opt-in and enterprise restriction cannot be disabled by a lower setting', () => {
  for (const managed of [false, true]) {
    for (const effective of [false, true]) {
      for (const inside of [false, true]) {
        assert.equal(shouldRejectOutOfScopeWrite(managed, effective, inside),
          (managed || effective) && !inside)
      }
    }
  }
})

test('write permission rejects outside scope before internal or user allow rules', () => {
  const permissions = source('src/utils/permissions/filesystem.ts')
  const write = permissions.slice(permissions.indexOf('export function checkWritePermissionForTool<'))
  const guard = write.indexOf('isWriteOutsideWorkingDirectoriesForbidden(')
  const allow = write.indexOf('checkEditableInternalPath(')
  assert.ok(guard >= 0 && allow > guard)
  assert.match(write.slice(guard, allow), /behavior: 'deny'/)
  assert.match(permissions, /getSettingsForSource\('policySettings'\)\?\.permissions\?\.blockWritesOutsideWorkingDirectories/)
  assert.match(permissions, /getInitialSettings\(\)\.permissions\?\.blockWritesOutsideWorkingDirectories/)
})

test('Write, Edit and NotebookEdit reject the configured out-of-scope path during validation', () => {
  for (const file of [
    'src/tools/FileWriteTool/FileWriteTool.ts',
    'src/tools/FileEditTool/FileEditTool.ts',
    'src/tools/NotebookEditTool/NotebookEditTool.ts',
  ]) {
    const sourceText = source(file)
    const validate = sourceText.slice(sourceText.indexOf('async validateInput('))
    assert.match(validate, /isWriteOutsideWorkingDirectoriesForbidden\(/, file)
    assert.match(validate, /result: false/, file)
    assert.match(validate, /errorCode: 13/, file)
  }
})

test('setting is a boolean validated within the shared permissions schema', () => {
  assert.match(source('src/utils/settings/types.ts'),
    /blockWritesOutsideWorkingDirectories: z\s*\.boolean\(\)\s*\.optional\(\)/)
})
