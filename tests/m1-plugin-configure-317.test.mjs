import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const binaries = [['rebuilt', 'bun', [join(root, 'dist/cli.js')]]]
if (process.env.CLAUDE_TARGET_X64) binaries.push(['official-2.1.317', process.env.CLAUDE_TARGET_X64, []])

test('2.1.317 plugin configure schema/--values-stdin, settings persistence and safe error paths', { timeout: 180_000 }, () => {
  for (const [variant, binary, prefix] of binaries) {
    const temp = mkdtempSync(join(tmpdir(), '333-plugin-config-317-'))
    const home = join(temp, 'home')
    const config = join(home, '.claude')
    const market = join(temp, 'market')
    const plugin = join(market, 'demo')
    mkdirSync(join(market, '.claude-plugin'), { recursive: true })
    mkdirSync(join(plugin, '.claude-plugin'), { recursive: true })
    mkdirSync(config, { recursive: true })
    writeFileSync(join(market, '.claude-plugin', 'marketplace.json'), JSON.stringify({
      name: 'm1-config-market', owner: { name: 'M1 Fixture' },
      plugins: [{ name: 'demo', source: './demo', description: 'local configuration fixture' }],
    }))
    writeFileSync(join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({
      name: 'demo', version: '1.0.0', description: 'Local plugin option tests',
      userConfig: {
        token: { type: 'string', title: 'API Token', description: 'Credential', required: true, sensitive: true },
        mode: { type: 'string', title: 'Mode', description: 'Execution mode', required: false },
      },
    }))
    const env = {
      ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: config,
      XDG_CONFIG_HOME: join(home, '.config'), DISABLE_AUTOUPDATER: '1',
      DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      NO_COLOR: '1', CI: '1',
    }
    for (const key of Object.keys(env)) if (key.startsWith('ANTHROPIC_')) delete env[key]
    const run = (args, input) => {
      const proc = spawnSync(binary, [...prefix, ...args], {
        cwd: home, env, input, encoding: 'utf8', timeout: 25000,
        maxBuffer: 4 * 1024 * 1024,
      })
      assert.equal(proc.error, undefined, `${variant} ${args.join(' ')}: ${proc.error?.message}`)
      return proc
    }
    const expectSuccess = args => {
      const proc = run(args)
      assert.equal(proc.status, 0, `${variant} ${args.join(' ')}: ${proc.stderr}`)
      return proc
    }
    try {
      expectSuccess(['plugin', 'marketplace', 'add', market])
      expectSuccess(['plugin', 'install', 'demo@m1-config-market'])
      const initial = expectSuccess(['plugin', 'configure', 'demo@m1-config-market', '--json'])
      const schema = JSON.parse(initial.stdout)
      assert.equal(schema.pluginId, 'demo@m1-config-market')
      assert.equal(schema.schema.token.sensitive, true)
      assert.ok(schema.unconfigured.includes('token'))
      assert.ok(schema.unconfigured.includes('mode'))
      const configured = run(['plugin', 'configure', 'demo@m1-config-market', '--values-stdin', '--json'],
        JSON.stringify({ mode: 'fast' }))
      assert.equal(configured.status, 0, `${variant} ${configured.stderr}`)
      assert.deepEqual(JSON.parse(configured.stdout).saved, ['mode'])
      const settings = JSON.parse(readFileSync(join(config, 'settings.json'), 'utf8'))
      assert.equal(settings.pluginConfigs['demo@m1-config-market'].options.mode, 'fast')
      const repeated = JSON.parse(expectSuccess(['plugin', 'configure', 'demo@m1-config-market', '--json']).stdout)
      assert.ok(repeated.configured.includes('mode'))
      assert.equal(repeated.inputs.token, '', 'sensitive values must never be disclosed')

      const invalid = run(['plugin', 'configure', 'demo@m1-config-market', '--values-stdin', '--json'],
        JSON.stringify({ nonexistent: 'secret-probe' }))
      assert.notEqual(invalid.status, 0, `${variant}: invalid option accepted`)
      assert.ok(!invalid.stdout.includes('secret-probe') && !invalid.stderr.includes('secret-probe'),
        `${variant}: rejected secret leaked to terminal`)
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  }
})
