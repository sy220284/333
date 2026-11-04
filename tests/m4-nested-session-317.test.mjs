import assert from 'node:assert/strict'
import { test } from 'node:test'

test('317 nested child sessions receive their own identity unless explicitly disabled', async () => {
  const { resolveInitialSessionId } = await import('../src/utils/remoteSessionIdentity.mjs')
  const getInitialRemoteSessionId = (env, argv) => resolveInitialSessionId(env, argv, () => null)
  const env = { CLAUDE_CODE_REMOTE_SESSION_ID: 'remote-parent', CLAUDE_CODE_CHILD_SESSION: '1' }
  assert.equal(getInitialRemoteSessionId(env, ['bun', 'cli.js', '-p', 'hello']), null)
  assert.notEqual(getInitialRemoteSessionId({ ...env, CLAUDE_CODE_DISABLE_NESTED_SESSION_ID: 'true' }, ['bun', 'cli.js', '-p', 'hello']), null)
})

test('317 explicit remote SDK clients and MCP servers retain the stable remote identity', async () => {
  const { resolveInitialSessionId } = await import('../src/utils/remoteSessionIdentity.mjs')
  const getInitialRemoteSessionId = (env, argv) => resolveInitialSessionId(env, argv, () => null)
  const env = { CLAUDE_CODE_REMOTE_SESSION_ID: ' remote-parent ', CLAUDE_CODE_CHILD_SESSION: '1' }
  const plain = getInitialRemoteSessionId({ ...env, CLAUDE_CODE_CHILD_SESSION: undefined }, [])
  assert.equal(plain, '13e4a06c-d8bb-549f-bfc1-01aaed15eedd')
  assert.equal(getInitialRemoteSessionId(env, ['bun', 'cli.js', '--sdk-url=wss://remote']), plain)
  assert.equal(getInitialRemoteSessionId(env, ['bun', 'cli.js', 'mcp', 'serve']), plain)
  assert.equal(getInitialRemoteSessionId(env, ['bun', 'cli.js', '-p', '--', '--sdk-url=wss://remote']), null)
  assert.equal(getInitialRemoteSessionId({}, []), null)
})
