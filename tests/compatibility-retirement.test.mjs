import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const root = new URL('../src/', import.meta.url)
function sources(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder.pathname ?? folder, entry.name)
    return entry.isDirectory() ? sources(path) : /\.tsx?$/.test(path) ? [path] : []
  })
}
function code(path) {
  return readFileSync(new URL(path, root), 'utf8').split('//# sourceMappingURL=')[0]
}

test('all settings consumers use current reader', () => {
  for (const path of sources(root)) {
    assert.doesNotMatch(readFileSync(path, 'utf8').split('//# sourceMappingURL=')[0], /\bgetSettings_DEPRECATED\b/, path)
  }
})
test('current configuration starts without historical migrations', () => {
  assert.equal(existsSync(new URL('migrations/', root)), false)
  assert.doesNotMatch(code('main.tsx'), /\brunMigrations\b|\bCURRENT_MIGRATION_VERSION\b|migrateChangelogFromConfig/)
  assert.match(code('main.tsx'), /await initializeVersionedPlugins\(\)/)
})
test('permissions, hooks and tool references use current names exactly', () => {
  for (const path of ['utils/permissions/permissionRuleParser.ts', 'utils/permissions/permissionSetup.ts', 'utils/hooks.ts', 'utils/messages.ts']) {
    assert.doesNotMatch(code(path), /normalizeLegacyToolName|getLegacyToolNames|LEGACY_TOOL_NAME_ALIASES/, path)
  }
  assert.match(code('utils/permissions/permissionRuleParser.ts'), /return \{ toolName: ruleString \}/)
  assert.doesNotMatch(code('utils/api.ts'), /TASK_OUTPUT_TOOL_NAME|case ['"]TaskOutput['"]/)
})
test('only V2 plugin registry exists, with explicit validation', () => {
  const manager = code('utils/plugins/installedPluginsManager.ts')
  assert.match(manager, /InstalledPluginsFileSchemaV2\(\)\.parse\(jsonParse\(fileContent\)\)/)
  assert.doesNotMatch(manager, /migrateV1ToV2|migrateToSinglePluginFile|migrateFromEnabledPlugins|installed_plugins_v2\.json|InstalledPluginsFileSchemaV1/)
  assert.doesNotMatch(code('utils/plugins/schemas.ts'), /InstalledPluginsFileSchemaV1|InstalledPluginsFileV1/)
})
