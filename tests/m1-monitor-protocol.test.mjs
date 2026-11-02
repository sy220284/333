import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPublicIp, validateMonitorArguments, validateMonitorWsUrl } from '../src/utils/monitorProtocol.mjs'

test('Monitor accepts exactly one command or WebSocket input and a bounded timeout', () => {
  assert.throws(() => validateMonitorArguments({description:'watch'}), /Exactly one/)
  assert.throws(() => validateMonitorArguments({description:'watch',command:'echo ok',ws:{url:'wss://example.org'}}), /Exactly one/)
  assert.doesNotThrow(() => validateMonitorArguments({description:'watch',command:'echo ok',timeout_ms:300000}))
  assert.throws(() => validateMonitorArguments({description:'watch',command:'echo ok',timeout_ms:3600001}), /timeout_ms/)
})
test('Monitor WebSocket blocklist covers loopback, metadata, RFC1918 and IPv6 private ranges', () => {
  for (const addr of ['127.0.0.1','10.3.2.1','169.254.169.254','172.17.1.2','192.168.1.20','100.64.1.2','::1','fd01::1','fe80::1']) {
    assert.equal(isPublicIp(addr),false,addr)
  }
  assert.equal(isPublicIp('1.1.1.1'),true)
  assert.equal(isPublicIp('2606:4700:4700::1111'),true)
})
test('Monitor rejects invalid WS scheme, credentials, hidden bytes, and duplicate subprotocols', () => {
  assert.throws(() => validateMonitorWsUrl('https://example.org'),/WebSocket/)
  assert.throws(() => validateMonitorWsUrl('ws://user:password@example.org'),/credentials/)
  assert.throws(() => validateMonitorWsUrl('ws://example.org/\nunsafe'),/printable ASCII/)
  assert.throws(() => validateMonitorArguments({description:'watch',ws:{url:'wss://example.org',protocols:['chat','chat']}}),/protocols/)
  assert.equal(validateMonitorWsUrl('wss://example.org/ws').hostname,'example.org')
})
