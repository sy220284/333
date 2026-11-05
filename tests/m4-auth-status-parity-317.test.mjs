import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { settleOAuthRefreshOnExit } from '../src/cli/handlers/oauthStatusWait.mjs'

test('317 exit barrier waits for the actual pending refresh to settle', async () => {
  let finished = false
  const promise = new Promise(resolve => setTimeout(() => { finished = true; resolve('saved') }, 25))
  assert.equal(await settleOAuthRefreshOnExit(promise, 1000), true)
  assert.equal(finished, true)
})
test('317 exit barrier has a bounded wait when token storage stalls', async () => {
  assert.equal(await settleOAuthRefreshOnExit(new Promise(() => {}), 5), false)
  await assert.rejects(settleOAuthRefreshOnExit(Promise.resolve(), -1), RangeError)
})
test('317 unauthenticated auth status JSON preserves original directory and privacy keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pr7-auth-status-'))
  try {
    const result = spawnSync('bun', [resolve(import.meta.dirname, '../dist/cli.js'), 'auth', 'status', '--json'], {
      cwd: resolve(import.meta.dirname, '..'),
      env: { ...process.env, CLAUDE_CONFIG_DIR: dir,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        DISABLE_TELEMETRY: '1',
        ANTHROPIC_API_KEY: '',
        ANTHROPIC_AUTH_TOKEN: '',
        CLAUDE_CODE_OAUTH_TOKEN: '',
        CLAUDE_CODE_USE_BEDROCK: '',
        CLAUDE_CODE_USE_VERTEX: '',
        CLAUDE_CODE_USE_FOUNDRY: '' },
      encoding: 'utf8', timeout: 15000,
    })
    assert.equal(result.status, 1, result.stderr)
    const value = JSON.parse(result.stdout)
    assert.equal(value.loggedIn, false)
    assert.equal(value.authMethod, 'none')
    assert.equal(value.apiProvider, 'firstParty')
    assert.equal(value.analyticsDisabled, true)
    assert.equal(value.projectsDirectory, join(dir, 'projects'))
    assert.equal(value.configDirectory, dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
