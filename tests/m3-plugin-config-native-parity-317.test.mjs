import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

// Real-world source and rebuilder comparison. Do not infer installation
// semantics from help text: status, stdout, exit code and persisted secrets
// are checked against the original 2.1.317 Linux x64 process.
const target = process.env.CLAUDE_TARGET_X64
const rebuilt = resolve(import.meta.dirname, '../dist/cli.js')

test('317 native and rebuilt plugin installation preserve config status and keychain boundaries', {
  skip: !target ? 'CLAUDE_TARGET_X64 is required for native differential verification' : false,
}, () => {
  const root = mkdtempSync(join(tmpdir(), '333-plugin-native-config-'))
  const market = join(root, 'market')
  const plugin = join(market, 'plugins', 'sample')
  mkdirSync(join(market, '.claude-plugin'), { recursive: true })
  mkdirSync(join(plugin, '.claude-plugin'), { recursive: true })
  writeFileSync(join(market, '.claude-plugin', 'marketplace.json'), JSON.stringify({
    name: 'config-parity-local',
    owner: { name: 'Local verification' },
    plugins: [{ name: 'sample', source: './plugins/sample' }],
  }))
  writeFileSync(join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({
    name: 'sample', version: '1.0.0', description: 'Local config verification',
    userConfig: {
      token: { title: 'Secret token', description: 'Verification token', type: 'string', required: true, sensitive: true },
    },
  }))
  const exercise = (kind, command, home) => {
    const isNative = kind === 'native'
    const executable = isNative ? target : 'bun'
    const argv = isNative ? command : [rebuilt, ...command]
    const env = {
      ...process.env,
      CLAUDE_CONFIG_DIR: home,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_TELEMETRY: '1',
    }
    const result = spawnSync(executable, argv, {
      cwd: root, encoding: 'utf8', env, timeout: 30000, maxBuffer: 1024 * 1024,
    })
    assert.ifError(result.error)
    assert.equal(result.status, 0, kind + ' ' + command.join(' ') + ': ' + result.stderr + '\n' + result.stdout)
    return result
  }
  try {
    const outcomes = {}
    for (const kind of ['native', 'rebuilt']) {
      const home = join(root, kind)
      exercise(kind, ['plugin', 'marketplace', 'add', market], home)
      const clean = exercise(kind, ['plugin', 'install', 'sample@config-parity-local', '--json'], home)
      const invalid = exercise(kind, ['plugin', 'install', 'sample@config-parity-local', '--config', 'missing=x', '--json'], home)
      const valid = exercise(kind, ['plugin', 'install', 'sample@config-parity-local', '--config', 'token=verification-secret', '--json'], home)
      const parse = output => JSON.parse(output.stdout.trim().split(/\r?\n/).at(-1))
      const initial = parse(clean), bad = parse(invalid), good = parse(valid)
      assert.equal(initial.outcome, 'ok')
      assert.equal(bad.outcome, 'ok')
      assert.equal(bad.configApplied, false)
      assert.match(bad.message, /Installed, but --config not applied/)
      assert.equal(good.outcome, 'ok')
      assert.equal(good.configApplied, true)
      assert.ok(existsSync(join(home, 'settings.json')))
      assert.ok(!readFileSync(join(home, 'settings.json'), 'utf8').includes('verification-secret'),
        'Sensitive option must never leak into plaintext settings')
      outcomes[kind] = [initial.outcome, bad.outcome, bad.configApplied, good.outcome, good.configApplied]
    }
    assert.deepEqual(outcomes.rebuilt, outcomes.native, 'Native and rebuilt installation semantics diverged')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
