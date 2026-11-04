import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { migrateInstalledPluginsRecords } from '../src/utils/plugins/installedPluginsMigration.mjs'

const v1 = (version = '1.2.3') => ({ version: 1, plugins: { 'alpha@market': { version, installedAt: '2026-01-01', installPath: '/legacy/path', gitCommitSha: '123abc' } } })
const v2 = (id = 'beta@market') => ({ version: 2, plugins: { [id]: [{ scope: 'project', projectPath: '/project', installPath: '/active/plugin', version: '2.0.0' }] } })
const put = (dir, file, data) => writeFileSync(join(dir, file), JSON.stringify(data))
const get = (dir, file = 'installed_plugins.json') => JSON.parse(readFileSync(join(dir, file), 'utf8'))
function inSandbox(fn) {
  const home = mkdtempSync(join(tmpdir(), '333-plugin-migration-'))
  const dir = join(home, 'plugins')
  mkdirSync(dir)
  const cache = (id, version) => join(dir, 'cache', ...id.split('@').reverse(), version)
  try { fn(dir, cache) } finally { rmSync(home, { recursive: true, force: true }) }
}

test('317: V1 records become V2 and remain stable across restarts', () => inSandbox((dir, cache) => {
  put(dir, 'installed_plugins.json', v1())
  assert.equal(migrateInstalledPluginsRecords(dir, cache), true)
  assert.deepEqual(get(dir).plugins['alpha@market'], [{
    scope: 'user', installPath: cache('alpha@market', '1.2.3'),
    version: '1.2.3', installedAt: '2026-01-01', gitCommitSha: '123abc',
  }])
  const saved = readFileSync(join(dir, 'installed_plugins.json'))
  assert.equal(migrateInstalledPluginsRecords(dir, cache), false)
  assert.deepEqual(readFileSync(join(dir, 'installed_plugins.json')), saved)
  assert.equal(readdirSync(dir).filter(file => file.includes('.before-v2-')).length, 1)
}))

test('317: separated V2 registry is merged, verified and backed up', () => inSandbox((dir, cache) => {
  put(dir, 'installed_plugins_v2.json', v2())
  const original = readFileSync(join(dir, 'installed_plugins_v2.json'))
  assert.equal(migrateInstalledPluginsRecords(dir, cache), true)
  assert.deepEqual(get(dir), v2())
  const backup = readdirSync(dir).find(file => file.startsWith('installed_plugins_v2.json.before-v2-'))
  assert.ok(backup)
  assert.deepEqual(readFileSync(join(dir, backup)), original)
  assert.equal(readdirSync(dir).includes('installed_plugins_v2.json'), false)
  assert.equal(migrateInstalledPluginsRecords(dir, cache), false)
}))

test('317: disjoint historical installation scopes are preserved', () => inSandbox((dir, cache) => {
  put(dir, 'installed_plugins.json', v1())
  put(dir, 'installed_plugins_v2.json', v2())
  assert.equal(migrateInstalledPluginsRecords(dir, cache), true)
  assert.deepEqual(Object.keys(get(dir).plugins).sort(), ['alpha@market', 'beta@market'])
  assert.equal(readdirSync(dir).filter(file => file.includes('.before-v2-')).length, 2)
}))

test('317: competing same-scope records fail without replacing either source', () => inSandbox((dir, cache) => {
  put(dir, 'installed_plugins.json', v1())
  put(dir, 'installed_plugins_v2.json', { version: 2, plugins: { 'alpha@market': [{ scope: 'user', installPath: '/conflict', version: '2.0.0' }] } })
  const original = readdirSync(dir).map(file => [file, readFileSync(join(dir, file))])
  assert.throws(() => migrateInstalledPluginsRecords(dir, cache), /Conflicting plugin installation/)
  assert.deepEqual(readdirSync(dir).map(file => [file, readFileSync(join(dir, file))]), original)
}))

test('317: invalid data and mismatching backup cannot silently overwrite user files', () => inSandbox((dir, cache) => {
  put(dir, 'installed_plugins.json', { version: 3, plugins: {} })
  assert.throws(() => migrateInstalledPluginsRecords(dir, cache), /Unsupported/)
  put(dir, 'installed_plugins.json', v1())
  put(dir, 'installed_plugins_v2.json', { version: 2, plugins: { bad: [] } })
  assert.throws(() => migrateInstalledPluginsRecords(dir, cache), /Invalid plugin ID/)
  rmSync(join(dir, 'installed_plugins_v2.json'))
  const original = readFileSync(join(dir, 'installed_plugins.json'))
  const suffix = createHash('sha256').update(original).digest('hex').slice(0, 16)
  writeFileSync(join(dir, 'installed_plugins.json.before-v2-' + suffix + '.bak'), 'mismatch')
  assert.throws(() => migrateInstalledPluginsRecords(dir, cache), /backup does not match/)
  assert.deepEqual(readFileSync(join(dir, 'installed_plugins.json')), original)
}))

test('317: registry symlink is rejected at migration boundary', () => inSandbox((dir, cache) => {
  put(dir, 'outside.json', v1())
  symlinkSync(join(dir, 'outside.json'), join(dir, 'installed_plugins.json'))
  assert.throws(() => migrateInstalledPluginsRecords(dir, cache), /Unsafe/)
}))
