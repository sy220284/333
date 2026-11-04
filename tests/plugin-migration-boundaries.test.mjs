import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { test } from 'node:test'
import { normalizeInstalledPluginsRecords } from '../src/utils/plugins/installedPluginsMigration.mjs'

function productionFunction(file, name, dependencies, prefix = '') {
  const source = stripTypeScriptTypes(readFileSync(new URL(`../src/utils/plugins/${file}`, import.meta.url), 'utf8'))
  const start = source.indexOf(`export ${name === 'initializeVersionedPlugins' ? 'async ' : ''}function ${name}(`)
  assert.ok(start >= 0)
  const end = source.indexOf('\n}', start) + 2
  return new Function(...Object.keys(dependencies), `${prefix}\n${source.slice(start, end).replace('export ', '')}\nreturn ${name}`)(...Object.values(dependencies))
}

test('current plugin initialization publishes one session snapshot', async () => {
  let snapshots = 0
  let migrationChecks = 0
  const initialize = productionFunction('installedPluginsManager.ts', 'initializeVersionedPlugins', {
    clearInstalledPluginsCache: () => {},
    ensureInstalledPluginsMigrated: () => { migrationChecks++ },
    getInMemoryInstalledPlugins: () => { snapshots++; return { version: 2, plugins: {} } },
    logForDebugging: () => {},
  }, 'let initializationPromise = null')
  await Promise.all([initialize(), initialize()])
  await initialize()
  assert.equal(snapshots, 1)
  assert.equal(migrationChecks, 1)
})

test('V1 registry is normalized read-only; malformed JSON, invalid V1 and read errors are rejected', () => {
  const source = stripTypeScriptTypes(readFileSync(new URL('../src/utils/plugins/installedPluginsManager.ts', import.meta.url), 'utf8'))
  const start = source.indexOf('function readInstalledPluginsFileRaw(')
  const end = source.indexOf('\n}', start) + 2
  assert.ok(start >= 0 && end > start)
  let content = JSON.stringify({ version: 2, plugins: {} })
  const create = new Function(
    'getFsImplementation', 'getInstalledPluginsFilePath', 'isENOENT',
    'InstalledPluginsFileSchemaV2', 'jsonParse',
    'normalizeInstalledPluginsRecords', 'getVersionedCachePath',
    `${source.slice(start, end)}\nreturn readInstalledPluginsFileRaw`,
  )
  const read = create(
    () => ({
      readFileSync: () => {
        if (content === null) {
          const error = new Error('missing')
          error.code = 'ENOENT'
          throw error
        }
        return content
      },
    }),
    () => 'installed_plugins.json',
    error => error.code === 'ENOENT',
    () => ({ parse: value => {
      if (value.version !== 2) throw new Error('V2 normalized result required')
      return value
    } }),
    JSON.parse,
    normalizeInstalledPluginsRecords,
    (id, version) => `/cache/${id}/${version}`,
  )
  assert.equal(read().version, 2)
  content = JSON.stringify({
    version: 1,
    plugins: { 'legacy@market': { version: '1.0.0', installedAt: '2026-01-01', installPath: '/legacy/path' } },
  })
  const original = content
  const converted = read()
  assert.equal(converted.version, 2)
  assert.equal(converted.plugins['legacy@market'][0].scope, 'user')
  assert.equal(converted.plugins['legacy@market'][0].installPath, '/cache/legacy@market/1.0.0')
  assert.equal(content, original, 'read-only conversion cannot change the original file')
  content = JSON.stringify({ version: 1, plugins: { 'broken': {} } })
  assert.throws(read, /Invalid V1 plugin installation/)
  content = '{ invalid-json'
  assert.throws(read, /JSON|position|Unexpected/)
  content = null
  assert.equal(read(), null)
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
