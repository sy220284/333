import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cleanBashSpawnEnvironment } from '../src/utils/bash/childEnv.mjs'

test('317 Bash child processes strip inherited startup option variables', () => {
  const original = { PATH: process.env.PATH, SHELLOPTS: 'errexit:pipefail', BASHOPTS: 'extdebug', OTHER: 'kept' }
  const sanitized = cleanBashSpawnEnvironment(original, 'bash')
  assert.deepEqual(sanitized, { PATH: process.env.PATH, OTHER: 'kept' })
  assert.equal(original.SHELLOPTS, 'errexit:pipefail')
  assert.equal(cleanBashSpawnEnvironment(original, 'zsh'), original)
})

test('317 Bash tool continues after a nonzero intermediate command despite parent SHELLOPTS', { skip: process.platform === 'win32' }, () => {
  const env = cleanBashSpawnEnvironment({ ...process.env, SHELLOPTS: 'errexit:pipefail' }, 'bash')
  const result = spawnSync('bash', ['-c', 'false; printf continued'], { env, encoding: 'utf8', timeout: 5000 })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, 'continued')
})
