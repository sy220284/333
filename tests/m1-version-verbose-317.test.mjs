import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const native = join(root, 'dist', process.platform === 'win32' ? 'claude.exe' : 'claude')
const sources = [
  ['Bun source rebuild', 'bun', [join(root, 'dist/cli.js')]],
  ['compiled standalone', native, []],
]
if (process.platform === 'linux' && process.env.CLAUDE_TARGET_X64)
  sources.unshift(['verified official x64', process.env.CLAUDE_TARGET_X64, []])

for (const [name, command, prefix] of sources) {
  const version = `2.1.317 (${name === 'verified official x64' ? 'Claude Code' : '333'})`
  const verbose = `${version}\nCommit: 3d3e7cb16b5577dccaee9520c8dc1189d02d61b7`
  test('M1 C19-T02: ' + name + ' fast version and verbose commit are byte-for-byte aligned', () => {
    for (const first of ['--version', '-v', '-V']) {
      for (const suffix of [[], ['--verbose']]) {
        const args = [...prefix, first, ...suffix]
        const res = spawnSync(command, args, {
          cwd: root, encoding: 'utf8', timeout: 15_000,
          env: { ...process.env, DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
        })
        assert.equal(res.error, undefined, String(res.error))
        assert.equal(res.status, 0, name + ': ' + res.stderr)
        assert.equal(res.stdout.replace(/\r\n/g, '\n').trimEnd(),
          suffix.length ? verbose : version, name + ' ' + args.join(' '))
      }
    }
  })
}
