import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { test } from 'node:test'

// Execute the production functions with isolated storage and migration services.
function productionFunction(file, name, dependencies, prefix = '') {
  const source = stripTypeScriptTypes(readFileSync(new URL(`../src/utils/plugins/${file}`, import.meta.url), 'utf8'))
  const start = source.indexOf(`export ${name === 'initializeVersionedPlugins' ? 'async ' : ''}function ${name}(`)
  assert.ok(start >= 0)
  const end = source.indexOf('\n}', start) + 2
  return new Function(...Object.keys(dependencies), `${prefix}\n${source.slice(start, end).replace('export ', '')}\nreturn ${name}`)(...Object.values(dependencies))
}

test('plugin initialization shares migration, waits for persistence, then refreshes snapshot', async () => {
  const events = []
  let release
  const persisted = new Promise(resolve => { release = resolve })
  const initialize = productionFunction('installedPluginsManager.ts', 'initializeVersionedPlugins', {
    migrateToSinglePluginFile: () => events.push('format'),
    migrateFromEnabledPlugins: async () => { events.push('sync'); await persisted },
    clearInstalledPluginsCache: () => events.push('clear'),
    getInMemoryInstalledPlugins: () => { events.push('snapshot'); return { plugins: { migrated: [] } } },
    logForDebugging: () => {},
  }, 'let initializationPromise = null')
  const first = initialize(), second = initialize()
  assert.deepEqual(events, ['format', 'sync'])
  release()
  await Promise.all([first, second])
  assert.deepEqual(events, ['format', 'sync', 'clear', 'snapshot'])
  await initialize()
  assert.equal(events.length, 4)
})

test('failed plugin migration retries without publishing a session snapshot', async () => {
  let attempts = 0, snapshots = 0
  const initialize = productionFunction('installedPluginsManager.ts', 'initializeVersionedPlugins', {
    migrateToSinglePluginFile: () => {},
    migrateFromEnabledPlugins: async () => { if (++attempts === 1) throw new Error('disk unavailable') },
    clearInstalledPluginsCache: () => {},
    getInMemoryInstalledPlugins: () => { snapshots++; return { plugins: {} } },
    logForDebugging: () => {},
  }, 'let initializationPromise = null')
  await assert.rejects(initialize, /disk unavailable/)
  assert.equal(snapshots, 0)
  await initialize()
  assert.equal(attempts, 2)
  assert.equal(snapshots, 1)
})

for (const kind of ['options', 'mcp']) {
  test(`${kind} saves only its user-scope patch and leaves cached settings untouched`, () => {
    const user = { model: 'user-model', pluginConfigs: { sample: { options: { token: 'legacy-secret' }, mcpServers: { server: { token: 'legacy-secret' } } } } }
    const original = structuredClone(user)
    const writes = []
    let secure = {}
    const dependencies = {
      getSettingsForSource: source => { assert.equal(source, 'userSettings'); return user },
      getInitialSettings: () => { throw new Error('Merged settings must not be used for writes') },
      updateSettingsForSource: (scope, patch) => { writes.push({ scope, patch }); return {} },
      getSecureStorage: () => ({ read: () => secure, update: value => { secure = value; return { success: true } } }),
      clearPluginOptionsCache: () => {},
      serverSecretsKey: (plugin, server) => `${plugin}/${server}`,
      logForDebugging: () => {}, logError: () => {}, toError: error => error,
    }
    const save = productionFunction(kind === 'options' ? 'pluginOptionsStorage.ts' : 'mcpbHandler.ts', kind === 'options' ? 'savePluginOptions' : 'saveMcpServerUserConfig', dependencies)
    const values = { token: 'new-secret', endpoint: 'user-value' }, schema = { token: { sensitive: true } }
    if (kind === 'options') save('sample', values, schema)
    else save('sample', 'server', values, schema)
    assert.deepEqual(user, original)
    assert.equal(writes.length, 1)
    assert.equal(writes[0].scope, 'userSettings')
    assert.deepEqual(Object.keys(writes[0].patch), ['pluginConfigs'])
    const saved = kind === 'options' ? writes[0].patch.pluginConfigs.sample.options : writes[0].patch.pluginConfigs.sample.mcpServers.server
    assert.deepEqual(saved, { endpoint: 'user-value', token: undefined })
    assert.equal(JSON.stringify(writes).includes('new-secret'), false)
    assert.equal(JSON.stringify(secure).includes('new-secret'), true)
  })
}
