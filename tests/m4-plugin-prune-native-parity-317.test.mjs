import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const original = process.env.CLAUDE_TARGET_X64
const rebuilt = resolve(import.meta.dirname, '../dist/cli.js')
const cases = [
  { args: ['plugin', 'prune', '--yes'], status: 0, pattern: /Nothing to prune.*user scope/ },
  { args: ['plugin', 'prune', '--dry-run'], status: 0, pattern: /Nothing to prune.*user scope/ },
  { args: ['plugin', 'prune', '--scope', 'project', '--yes'], status: 0, pattern: /Nothing to prune.*project scope/ },
  { args: ['plugin', 'prune', '--scope', 'local', '--yes'], status: 0, pattern: /Nothing to prune.*local scope/ },
  { args: ['plugin', 'prune', '--scope', 'invalid', '--yes'], status: 1, pattern: /Invalid scope: invalid/ },
]

test('2.1.317 official x64 and rebuilt plugin prune agree on empty scopes and errors', {
  skip: !original && 'Requires official 2.1.317 Linux x64 program',
}, () => {
  const root = mkdtempSync(join(tmpdir(), 'pr7-prune-oracle-'))
  try {
    for (const [index, row] of cases.entries()) {
      const compare = []
      for (const kind of ['official', 'rebuilt']) {
        const executable = kind === 'official' ? original : 'bun'
        const args = kind === 'official' ? row.args : [rebuilt, ...row.args]
        const home = join(root, kind, String(index))
        const result = spawnSync(executable, args, {
          cwd: root, encoding: 'utf8', timeout: 12_000,
          env: { ...process.env, CLAUDE_CONFIG_DIR: home,
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1' },
        })
        assert.equal(result.error, undefined, kind + ': ' + String(result.error))
        assert.equal(result.status, row.status, kind + ': ' + result.stderr + result.stdout)
        assert.match(result.stdout + result.stderr, row.pattern)
        compare.push({
          status: result.status,
          stdout: result.stdout.replace(/\r\n/g, '\n'),
          stderr: result.stderr.replace(/\r\n/g, '\n'),
        })
      }
      assert.deepEqual(compare[1], compare[0], row.args.join(' '))
    }
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})
