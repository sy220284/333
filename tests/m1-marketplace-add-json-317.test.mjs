import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const commands = [['rebuilt', 'bun', [join(root, 'dist/cli.js')]]]
if (process.env.CLAUDE_TARGET_X64) {
  commands.push(['official-2.1.317', process.env.CLAUDE_TARGET_X64, []])
}

test('2.1.317 plugin marketplace add --json: one structured line and idempotent local install', { timeout: 120_000 }, () => {
  for (const [variant, binary, prefix] of commands) {
    const temp = mkdtempSync(join(tmpdir(), '333-m1-marketplace-json-'))
    const home = join(temp, 'home')
    const config = join(home, '.claude')
    const source = join(temp, 'source')
    mkdirSync(join(source, '.claude-plugin'), { recursive: true })
    mkdirSync(config, { recursive: true })
    writeFileSync(join(source, '.claude-plugin', 'marketplace.json'), JSON.stringify({
      name: 'm1-json-test', owner: { name: 'M1 Fixture' }, plugins: [],
    }))
    const env = {
      ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: config,
      XDG_CONFIG_HOME: join(home, '.config'),
      DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', NO_COLOR: '1',
      CI: '1',
    }
    for (const key of Object.keys(env)) if (key.startsWith('ANTHROPIC_')) delete env[key]
    try {
      for (let iteration = 0; iteration < 2; iteration++) {
        const run = spawnSync(binary, [...prefix, 'plugin', 'marketplace', 'add', source, '--json'], {
          cwd: home, env, encoding: 'utf8', timeout: 25000,
        })
        assert.equal(run.error, undefined, `${variant}: ${run.error?.message}`)
        assert.equal(run.status, 0, `${variant}: ${run.stderr}\n${run.stdout}`)
        const lines = run.stdout.trim().split(/\r?\n/).filter(Boolean)
        assert.equal(lines.length, 1, `${variant}: JSON output included progress messages`)
        const result = JSON.parse(lines[0])
        assert.deepEqual(Object.keys(result), ['command', 'outcome', 'marketplace', 'message'])
        assert.equal(result.command, 'marketplace-add')
        assert.equal(result.outcome, 'ok')
        assert.equal(result.marketplace, 'm1-json-test')
        assert.match(result.message, iteration === 0 ? /Successfully added/ : /already on disk/)
      }
      const settings = JSON.parse(readFileSync(join(config, 'settings.json'), 'utf8'))
      assert.ok(settings.extraKnownMarketplaces['m1-json-test'], `${variant}: marketplace was not persisted`)
    } finally {
      rmSync(temp, { recursive: true, force: true })
    }
  }
})
