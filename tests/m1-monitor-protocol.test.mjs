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
  const inputOnly=code.split('const inputSchema')[1].split('type InputSchema')[0]
  assert.equal(inputOnly.includes('persistent:z.boolean()'),false)
  assert.equal(code.includes('Math.min(input.timeout_ms,600000)'), true)
  assert.equal(code.includes('pendingLines.push(line)'), true)
  assert.equal(code.includes('const drainMonitorEvents=()=>'), true)
  assert.equal(code.includes('drainMonitorEvents},'), true)
  const lifecycle=await readFile(new URL('../src/tasks/LocalShellTask/LocalShellTask.tsx',import.meta.url),'utf8')
  assert.equal(lifecycle.includes('input.drainMonitorEvents?.()'),true)
  assert.equal(lifecycle.includes("if (kind === 'monitor')"),true)
  assert.equal(lifecycle.includes('events.map(line =>'),true)
  const ws=await readFile(new URL('../src/tasks/MonitorWsTask/MonitorWsTask.ts',import.meta.url),'utf8')
  assert.equal(ws.includes("url.hostname.replace("),true)
})

test('Monitor WebSocket permission delegates authorized bypass to the central engine', async()=>{
 const code=await readFile(new URL('../src/tools/MonitorTool/MonitorTool.ts',import.meta.url),'utf8')
 assert.match(code,/decisionReason:\{type:'other' as const,reason:'WebSocket outbound connection requires permission'/)
 assert.match(code,/await verifyWsHost\(input.ws.url\)/)
 const engine=await readFile(new URL('../src/utils/permissions/permissions.ts',import.meta.url),'utf8')
 assert.match(engine,/appState.toolPermissionContext.mode === 'bypassPermissions'/)
 assert.match(engine,/toolPermissionResult\.decisionReason\?\.type === 'safetyCheck'/)
})

test('Monitor accepts fractional millisecond values within official numeric schema range',()=>{
 assert.doesNotThrow(()=>validateMonitorArguments({description:'observe',command:'echo hi',timeout_ms:1000.5}))
 assert.throws(()=>validateMonitorArguments({description:'observe',command:'echo hi',timeout_ms:Number.POSITIVE_INFINITY}),/timeout_ms/)
})
