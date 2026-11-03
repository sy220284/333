import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = new URL('../src/', import.meta.url)
const rootPath = fileURLToPath(root)
function sources(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name)
    return entry.isDirectory() ? sources(path) : /\.tsx?$/.test(path) ? [path] : []
  })
}
function code(path) {
  return readFileSync(new URL(path, root), 'utf8').split('//# sourceMappingURL=')[0]
}

test('all settings consumers use current reader', () => {
  for (const path of sources(rootPath)) {
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

test('retired shell and output tools are absent from current invocation paths', () => {
  const taskStop = code('tools/TaskStopTool/TaskStopTool.ts')
  assert.ok(taskStop.includes('task_id: z.string().min(1)'))
  assert.doesNotMatch(taskStop, /KillShell|shell_id|aliases:/)
  assert.doesNotMatch(code('tools/BriefTool/BriefTool.ts'), /LEGACY_BRIEF_TOOL_NAME|aliases:/)
  assert.doesNotMatch(code('services/tools/toolExecution.ts'), /getAllBaseTools|fallbackTool|deprecated tool being called by alias/)
  assert.equal(code('utils/env.ts').includes('.config.json'), false)
})

test('no old model remapping or one-shot migration fields remain', () => {
  const models = code('utils/model/model.ts')
  const config = code('utils/config.ts')
  for (const name of [
    'LEGACY_OPUS_FIRSTPARTY', 'isLegacyModelRemapEnabled',
    'CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP',
  ]) assert.equal(models.includes(name), false, name)
  for (const field of [
    'cachedChangelog', 'iterm2KeyBindingInstalled',
    'bypassPermissionsModeAccepted', 'legacyOpusMigrationTimestamp',
    'sonnet45To46MigrationTimestamp', 'opusProMigrationTimestamp',
  ]) assert.equal(config.includes(field), false, field)
  assert.equal(existsSync(new URL('hooks/notifs/useModelMigrationNotifications.tsx', root)), false)
})
