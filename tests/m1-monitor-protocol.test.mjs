import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { isPublicIp, validateMonitorArguments, validateMonitorWsUrl } from '../src/utils/monitorProtocol.mjs'

test('Monitor accepts exactly one command or WebSocket input and a bounded timeout', () => {
  assert.throws(() => validateMonitorArguments({description:'watch'}), /Exactly one/)
  assert.throws(() => validateMonitorArguments({description:'watch',command:'echo ok',ws:{url:'wss://example.org'}}), /Exactly one/)
  assert.doesNotThrow(() => validateMonitorArguments({description:'watch',command:'echo ok',timeout_ms:300000}))
  assert.throws(() => validateMonitorArguments({description:'watch',command:'echo ok',timeout_ms:3600001}), /timeout_ms/)
})
test('2.1.310 Monitor permits loopback but blocks private, metadata and IPv4-mapped IPv6', () => {
  for (const addr of ['10.3.2.1','169.254.169.254','172.17.1.2','192.168.1.20','100.64.1.2',
    'fd01::1','fe80::1','::ffff:c0a8:1','::ffff:192.168.1.20','0:0:0:0:0:ffff:0a00:0001']) {
    assert.equal(isPublicIp(addr),false,addr)
  }
  for (const addr of ['127.0.0.1','::1','::ffff:7f00:1','1.1.1.1','2606:4700:4700::1111']) {
    assert.equal(isPublicIp(addr),true,addr)
  }
})
test('Monitor rejects invalid WS scheme, credentials, hidden bytes, and duplicate subprotocols', () => {
  assert.throws(() => validateMonitorWsUrl('https://example.org'),/WebSocket/)
  assert.throws(() => validateMonitorWsUrl('ws://user:password@example.org'),/credentials/)
  assert.throws(() => validateMonitorWsUrl('ws://example.org/\nunsafe'),/printable ASCII/)
  assert.throws(() => validateMonitorArguments({description:'watch',ws:{url:'wss://example.org',protocols:['chat','chat']}}),/protocols/)
  assert.equal(validateMonitorWsUrl('wss://example.org/ws').hostname,'example.org')
})

test('public Monitor aligns timeout cap and does not discard stdout produced before task registration',async()=>{
  const file=new URL('../src/tools/MonitorTool/MonitorTool.ts',import.meta.url)
  const code=await readFile(file,'utf8')
  assert.doesNotMatch(code,/persistent:z\\.boolean\\(\\)/)
  assert.match(code,/Math\\.min\\(input\\.timeout_ms,600000\\)/)
  assert.match(code,/pendingLines\\.push\\(line\\)/)
  assert.match(code,/for\\(const line of pendingLines\\)emitLine\\(line\\)/)
  const ws=await readFile(new URL('../src/tasks/MonitorMcpTask/MonitorMcpTask.ts',import.meta.url),'utf8')
  assert.match(ws,/url\\.hostname\\.replace\\(/)
})
