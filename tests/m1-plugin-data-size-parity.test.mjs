import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const executables = [['rebuilt', 'bun', [join(root, 'dist/cli.js')]]]
const officialBinary = process.env.CLAUDE_TARGET_X64 || process.env.CLAUDE_2310_X64
if (officialBinary) {
  executables.push(['official-x64', officialBinary, []])
}

function run(binary, prefix, args, env, cwd) {
  const result = spawnSync(binary, [...prefix, ...args], {
    cwd, env, timeout: 30_000, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  })
  assert.equal(result.error, undefined, result.error?.message)
  return result
}

test('2.1.310 plugin list --data-size reads actual persistent plugin data and honors an exact plugin selector', { timeout: 120_000 }, () => {
  for (const [variant, binary, prefix] of executables) {
    const home = mkdtempSync(join(tmpdir(), '333-plugin-datasize-'))
    try {
      const config = join(home, '.claude')
      const project = join(home, 'project')
      mkdirSync(project)
      const plugins = join(config, 'plugins')
      const data = join(plugins, 'data', 'mock-test')
      mkdirSync(data, { recursive: true })
      writeFileSync(join(data, 'first.txt'), 'hello')
      writeFileSync(join(data, 'second.txt'), '1234567890')
      writeFileSync(join(plugins, 'installed_plugins.json'), JSON.stringify({
        version: 2,
        plugins: {
          'mock@test': [{
            scope: 'user',
            installPath: join(home, 'missing-plugin-installation'),
            version: '1.0.0',
            installedAt: '2026-01-01T00:00:00.000Z',
            lastUpdated: '2026-01-01T00:00:00.000Z',
          }],
        },
      }))
      const env = {
        ...process.env,
        HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: config,
        XDG_CONFIG_HOME: join(home, 'xdg'), NO_COLOR: '1', CI: 'true',
        DISABLE_TELEMETRY: '1', DISABLE_AUTOUPDATER: '1',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      }
      delete env.ANTHROPIC_API_KEY
      delete env.ANTHROPIC_AUTH_TOKEN
      delete env.CLAUDE_CODE_PLUGIN_CACHE_DIR
      delete env.CLAUDE_CODE_USE_COWORK_PLUGINS

      for (const flags of [['--data-size'], ['--data-size', 'mock@test']]) {
        const response = run(binary, prefix, ['plugin', 'list', '--json', ...flags], env, project)
        assert.equal(response.status, 0, `${variant} plugin list ${flags.join(' ')}: ${response.stderr}`)
        const rows = JSON.parse(response.stdout)
        const entry = rows.find(row => row.id === 'mock@test')
        assert.ok(entry, `${variant}: installed plugin absent from JSON result`)
        assert.deepEqual(entry.dataDirSize, { bytes: 15, human: '15 bytes' })
        assert.equal(entry.projectEnabled, false, `${variant}: projectEnabled must be present even without project settings`)
      }

      const projectConfig = join(project, '.claude')
      mkdirSync(projectConfig)
      writeFileSync(join(projectConfig, 'settings.json'), JSON.stringify({
        enabledPlugins: { 'mock@test': true },
      }))
      const projectResult = run(binary, prefix, ['plugin', 'list', '--json'], env, project)
      assert.equal(projectResult.status, 0, `${variant}: ${projectResult.stderr}`)
      assert.equal(JSON.parse(projectResult.stdout).find(row => row.id === 'mock@test')?.projectEnabled, true)
      rmSync(join(projectConfig, 'settings.json'))
      writeFileSync(join(projectConfig, 'settings.local.json'), JSON.stringify({
        enabledPlugins: { 'mock@test': true },
      }))
      const localResult = run(binary, prefix, ['plugin', 'list', '--json'], env, project)
      assert.equal(localResult.status, 0, `${variant}: ${localResult.stderr}`)
      assert.equal(JSON.parse(localResult.stdout).find(row => row.id === 'mock@test')?.projectEnabled, false)

      // The editable configuration source is different from the effective
      // runtime decision: local/project overrides must win over user values.
      rmSync(join(projectConfig, 'settings.local.json'))
      writeFileSync(join(config, 'settings.json'), JSON.stringify({
        enabledPlugins: { 'mock@test': true },
      }))
      writeFileSync(join(projectConfig, 'settings.json'), JSON.stringify({
        enabledPlugins: { 'mock@test': false },
      }))
      const projectDeny = run(binary, prefix, ['plugin', 'list', '--json'], env, project)
      assert.equal(projectDeny.status, 0, `${variant}: ${projectDeny.stderr}`)
      const deny = JSON.parse(projectDeny.stdout).find(row => row.id === 'mock@test')
      assert.deepEqual([deny?.enabled, deny?.projectEnabled], [false, false])

      writeFileSync(join(projectConfig, 'settings.json'), JSON.stringify({
        enabledPlugins: { 'mock@test': true },
      }))
      writeFileSync(join(projectConfig, 'settings.local.json'), JSON.stringify({
        enabledPlugins: { 'mock@test': false },
      }))
      const localDeny = run(binary, prefix, ['plugin', 'list', '--json'], env, project)
      assert.equal(localDeny.status, 0, `${variant}: ${localDeny.stderr}`)
      const denied = JSON.parse(localDeny.stdout).find(row => row.id === 'mock@test')
      assert.deepEqual([denied?.enabled, denied?.projectEnabled], [false, true])

      const unknown = run(binary, prefix, ['plugin', 'list', '--json', '--data-size', 'other'], env, project)
      assert.notEqual(unknown.status, 0, `${variant}: unknown plugin should be rejected`)
      assert.match(unknown.stderr, /not installed/)
      const unrequested = run(binary, prefix, ['plugin', 'list', '--json'], env, project)
      assert.equal(unrequested.status, 0, `${variant}: ${unrequested.stderr}`)
      const plain = JSON.parse(unrequested.stdout).find(row => row.id === 'mock@test')
      assert.ok(plain)
      assert.equal(plain.dataDirSize, undefined)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  }
})
