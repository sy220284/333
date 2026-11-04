import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  commandSourceDisclosure, localCatalogRevision,
} from '../src/utils/plugins/commandSourceConsent.mjs'

const official = process.env.CLAUDE_TARGET_X64
const rebuilt = resolve(import.meta.dirname, '../dist/cli.js')

function run(side, cwd, home, args) {
  const res = spawnSync(side === 'official' ? official : 'bun',
    side === 'official' ? args : [rebuilt, ...args], {
      cwd, encoding: 'utf8', timeout: 45000,
      env: {
        ...process.env, HOME: home, CLAUDE_CONFIG_DIR: home,
        DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      },
    })
  assert.equal(res.error, undefined, side + ' ' + args.join(' ') + ': ' + res.error)
  const lines = res.stdout.trim().split(/\r?\n/)
  let json
  for (const line of lines.reverse()) {
    if (line.startsWith('{') && line.includes('"outcome"')) {
      json = JSON.parse(line)
      break
    }
  }
  return { status: res.status, json, stdout: res.stdout, stderr: res.stderr }
}

test('317 native and rebuilt CLI reject changed command digests and execute only consented copy-source', {
  skip: !official && 'Requires official 2.1.317 Linux x64 oracle',
}, () => {
  assert.ok(official && rebuilt)
  const root = mkdtempSync(join(tmpdir(), 'pr7-command-source-'))
  try {
    const market = join(root, 'market')
    const target = join(root, 'plugin')
    mkdirSync(join(market, '.claude-plugin'), { recursive: true })
    mkdirSync(join(target, '.claude-plugin'), { recursive: true })
    writeFileSync(join(target, '.claude-plugin', 'plugin.json'), JSON.stringify({
      name: 'source-audit', version: '1.0.0', description: 'Local command source',
    }))
    const command = 'printf ' + JSON.stringify(target + '\\n')
    const marketplace = {
      name: 'source-market',
      owner: { name: 'Audit' },
      plugins: [{ name: 'source-audit', source: {
        source: 'command', command, mode: 'copy',
      } }],
    }
    writeFileSync(join(market, '.claude-plugin', 'marketplace.json'), JSON.stringify(marketplace))
    const revision = localCatalogRevision(marketplace)
    const expected = commandSourceDisclosure({
      pluginId: 'source-audit@source-market',
      command, mode: 'copy', catalogRevision: revision,
    })
    for (const side of ['official', 'rebuilt']) {
      const home = join(root, side)
      mkdirSync(home, { recursive: true })
      const add = run(side, root, home, ['plugin', 'marketplace', 'add', market, '--json'])
      assert.equal(add.status, 0, side + ' add: ' + add.stderr)
      const preview = run(side, root, home, ['plugin', 'install', 'source-audit@source-market', '--json'])
      assert.notEqual(preview.status, 0, side + ' preview must refuse')
      assert.equal(preview.json?.failureCode, 'command_source_refused', side)
      assert.equal(preview.json?.shownCommand?.sha256, expected.sha256, side)
      assert.equal(preview.json?.shownCommand?.catalogRevision, revision, side)
      const wrong = run(side, root, home, [
        'plugin', 'install', 'source-audit@source-market',
        '--json', '--accept-command', '0'.repeat(64),
      ])
      assert.notEqual(wrong.status, 0, side + ' stale digest must refuse')
      assert.equal(wrong.json?.shownCommand?.acceptCommandMatched, false, side)
      const grant = run(side, root, home, [
        'plugin', 'install', 'source-audit@source-market',
        '--json', '--accept-command', expected.sha256,
      ])
      assert.equal(grant.status, 0, side + ' grant: ' + grant.stderr + grant.stdout)
      assert.equal(grant.json?.outcome, 'ok', side)
      const settings = JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8'))
      assert.equal(settings.enabledPlugins?.['source-audit@source-market'], true, side)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
