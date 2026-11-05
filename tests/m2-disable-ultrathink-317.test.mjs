import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { test } from 'node:test'

const cwd = resolve(import.meta.dirname, '..')
const script = `
  import assert from 'node:assert/strict'
  import { isUltrathinkEnabled } from './src/utils/thinking.ts'
  assert.equal(isUltrathinkEnabled(), false)
`

test('2.1.317: environment opt-out prevents ultrathink, including before rollout lookups', () => {
  for (const value of ['1', 'true', 'YES', 'on']) {
    const proc = spawnSync('bun', ['-e', script], {
      cwd, env: { ...process.env, CLAUDE_CODE_DISABLE_ULTRATHINK: value },
      encoding: 'utf8', timeout: 12000,
    })
    assert.equal(proc.status, 0, `flag ${value}: ${proc.stderr}`)
  }
})
