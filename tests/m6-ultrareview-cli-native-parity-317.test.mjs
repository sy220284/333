import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const original = process.env.CLAUDE_TARGET_X64
const candidate = resolve(import.meta.dirname, '../dist/cli.js')
test('2.1.317 ultrareview standalone CLI: trust, option ordering and unavailable cloud states', {
  skip: !original && 'Requires official 2.1.317 x64 oracle',
}, () => {
  const root = mkdtempSync(join(tmpdir(), 'pr7-ultrareview-native-'))
  const cases = [
    ['ultrareview'],
    ['ultrareview', 'main'],
    ['ultrareview', '--trust-workspace'],
    ['ultrareview', '--json', '--trust-workspace'],
    ['ultrareview', '--timeout', '0', '--trust-workspace'],
    ['ultrareview', '--trust-workspace', 'main'],
  ]
  try {
    for (let index = 0; index < cases.length; index++) {
      const cmd = cases[index]
      const results = []
      for (const side of ['native', 'rebuilt']) {
        const args = side === 'native' ? cmd : [candidate, ...cmd]
        const proc = spawnSync(side === 'native' ? original : 'bun', args, {
          cwd: root, encoding: 'utf8', timeout: 15_000,
          env: {
            ...process.env,
            CLAUDE_CONFIG_DIR: join(root, side, String(index)),
            DISABLE_TELEMETRY: '1',
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
          },
        })
        assert.equal(proc.error, undefined, side + ' ' + cmd.join(' ') + ': ' + String(proc.error))
        assert.equal(proc.status, 1, side + ' ' + cmd.join(' ') + ': ' + proc.stderr)
        results.push({
          status: proc.status,
          stdout: proc.stdout.replace(/\r\n/g, '\n'),
          stderr: proc.stderr.replace(/\r\n/g, '\n'),
        })
      }
      assert.deepEqual(results[1], results[0], cmd.join(' '))
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
