import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../src/', import.meta.url)
const protocol = readFileSync(new URL('bridge/sessionIdProtocol.ts', root), 'utf8')
  .replaceAll('export function', 'function')
  .replaceAll(': string', '')
const { toSessionApiId, toWorkerApiId } =
  new Function(`${protocol}; return { toSessionApiId, toWorkerApiId }`)()

test('remote session IDs convert only at the current API boundary', () => {
  assert.equal(toSessionApiId('cse_1234'), 'session_1234')
  assert.equal(toSessionApiId('session_1234'), 'session_1234')
  assert.equal(toWorkerApiId('session_1234'), 'cse_1234')
  assert.equal(toWorkerApiId('cse_1234'), 'cse_1234')
})
test('remote session callers use the protocol helper, not the old shim', () => {
  assert.equal(existsSync(new URL('bridge/sessionIdCompat.ts', root)), false)
  const callers = [
    'bridge/replBridge.ts', 'bridge/bridgeMain.ts',
    'bridge/createSession.ts', 'bridge/replBridgeHandle.ts',
    'bridge/remoteBridgeCore.ts', 'constants/product.ts',
  ]
  for (const path of callers) {
    const code = readFileSync(new URL(path, root), 'utf8').split('//# sourceMappingURL=')[0]
    assert.equal(/toCompatSessionId|toInfraSessionId|sessionIdCompat/.test(code), false, path)
    assert.match(code, /toSessionApiId|toWorkerApiId/)
  }
})
test('remote reconnect attempts only the current worker ID', () => {
  const main = readFileSync(new URL('bridge/bridgeMain.ts', root), 'utf8')
  const repl = readFileSync(new URL('bridge/replBridge.ts', root), 'utf8')
  assert.ok(main.includes('const reconnectCandidates = [toWorkerApiId(resumeSessionId)]'))
  assert.ok(repl.includes('const candidates = [toWorkerApiId(sessionId)]'))
})
