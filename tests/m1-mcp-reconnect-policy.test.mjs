import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { canRetryMcpToolAfterSessionLoss, resolveMcpReconnectBlockReason } from '../src/services/mcp/reconnectGate.ts'

const src = name => readFileSync(new URL(`../src/services/mcp/${name}`, import.meta.url), 'utf8')

test('disabled MCP server cannot reconnect despite an otherwise allowed config', () => {
  assert.equal(resolveMcpReconnectBlockReason(true, true), 'disabled')
  assert.equal(resolveMcpReconnectBlockReason(true, false), 'disabled')
})

test('managed policy blocks reconnect; an enabled allowed server proceeds', () => {
  assert.equal(resolveMcpReconnectBlockReason(false, false), 'managed-policy')
  assert.equal(resolveMcpReconnectBlockReason(false, true), null)
})

test('CLI and interactive reconnection consult the same gate before reconnecting', () => {
  const config = src('config.ts')
  const client = src('client.ts')
  const ui = src('useManageMCPConnections.ts')
  assert.match(config, /export function getMcpReconnectBlockReason/)
  assert.match(config, /filterMcpServersByPolicy/)
  const guardedReconnect = client.slice(client.indexOf('export async function reconnectMcpServerImpl('))
  assert.ok(guardedReconnect.indexOf('getMcpReconnectBlockReason') < guardedReconnect.indexOf('clearKeychainCache()'))
  assert.match(guardedReconnect, /type: 'disabled'/)
  assert.match(guardedReconnect, /blocked by enterprise managed policy/)
  assert.match(ui, /const closeBlock = getMcpReconnectBlockReason/)
  assert.match(ui, /const retryBlock = getMcpReconnectBlockReason/)
})

test('ambiguous transport loss does not rerun non-idempotent MCP tools', () => {
  assert.equal(canRetryMcpToolAfterSessionLoss(true, false, false), false)
  assert.equal(canRetryMcpToolAfterSessionLoss(true, false, true), true)
  assert.equal(canRetryMcpToolAfterSessionLoss(true, true, false), true)
  assert.equal(canRetryMcpToolAfterSessionLoss(false, false, false), true)
})

test('the tool retry logic distinguishes known session invalidation from ambiguous loss', () => {
  const client = src('client.ts')
  assert.match(client, /new McpSessionExpiredError\(name, !isSessionExpired\)/)
  assert.match(client, /canRetryMcpToolAfterSessionLoss\(/)
  assert.match(client, /tool\.annotations\?\.idempotentHint === true/)
})
