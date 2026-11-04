import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  migrateInstalledPluginsRecords,
  normalizeInstalledPluginsRecords,
} from '../src/utils/plugins/installedPluginsMigration.mjs'

const root = resolve(import.meta.dirname, '..')

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

test('317: read-only V1 normalization does not modify the source file', () => inSandbox((dir, cache) => {
  put(dir, 'installed_plugins.json', v1())
  const before = readFileSync(join(dir, 'installed_plugins.json'))
  const viewed = normalizeInstalledPluginsRecords(get(dir), cache)
  assert.equal(viewed.version, 2)
  assert.equal(viewed.plugins['alpha@market'][0].scope, 'user')
  assert.deepEqual(readFileSync(join(dir, 'installed_plugins.json')), before)
  assert.equal(readdirSync(dir).length, 1)
}))

test('317: real CLI plugin list reads historical V1 without modifying installed records', { timeout: 40000 }, () => inSandbox((dir) => {
  const home = resolve(dir, '..')
  const project = join(home, 'project')
  mkdirSync(project)
  put(dir, 'installed_plugins.json', v1())
  const original = readFileSync(join(dir, 'installed_plugins.json'))
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CONFIG_DIR: join(home, '.claude'),
    CLAUDE_CODE_PLUGIN_CACHE_DIR: dir,
    XDG_CONFIG_HOME: join(home, '.config'),
    NO_COLOR: '1',
    CI: 'true',
    DISABLE_AUTOUPDATER: '1',
    DISABLE_TELEMETRY: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  const commands = [['rebuilt', 'bun', [join(root, 'dist/cli.js')]]]
  if (env.CLAUDE_TARGET_X64) commands.push(['official-317', env.CLAUDE_TARGET_X64, []])
  for (const [label, command, prefix] of commands) {
    const result = spawnSync(command, [...prefix, 'plugin', 'list', '--json'], {
      cwd: project, env, encoding: 'utf8', timeout: 25000,
    })
    assert.equal(result.error, undefined, `${label}: ${result.error?.message}`)
    assert.equal(result.status, 0, `${label}: ${result.stderr}`)
    assert.deepEqual(readFileSync(join(dir, 'installed_plugins.json')), original,
      `${label}: read-only plugin list modified the historical V1 file`)
  }
}))
