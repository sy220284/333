import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { buildAgentListing, listReachableTeammates } from '../src/tools/ListAgentsTool/peerListing.mjs'
import { peerRef, listLiveLocalPeers, resolveLocalPeerAddress } from '../src/utils/livePeerSessions.mjs'
const root = fileURLToPath(new URL('..', import.meta.url))
const source = path => readFile(resolve(root, path), 'utf8')
test('team roster includes only registered unique recipients', () => {
  assert.deepEqual(listReachableTeammates({ members: [
    {name:'team-lead'}, {name:'worker'}, {name:'Worker'}, {name:'bad@team'}, {name:''}
  ] }, 'team-lead'), [{name:'worker',to:'worker',channel:'team'}])
})
test('no active team means no invented addresses', () => {
  assert.deepEqual(listReachableTeammates(null,'current-session'),[])
})
test('list output uses the official structured fields and filters sections', () => {
  const r=buildAgentListing({self:'current [abc123]',subagents:[{name:'agent',status:'running'}],teammates:[{name:'teammate'}],sessions:[{name:'session',ref:'123abc',status:'busy'}]})
  assert.deepEqual(r.sections.map(s=>[s.kind,s.total]),[['subagents',1],['teammates',1],['sessions',1]])
  assert.match(r.listing,/Peer sessions \(1\):/)
  assert.match(r.listing,/session \[123abc\]/)
  assert.match(r.listing,/This session is current/)
  assert.equal(buildAgentListing({sessions:[{name:'alpha'},{name:'beta'}],query:'beta'}).sections[0].total,1)
})
test('missing SendMessage cannot be advertised as available, including an empty listing',()=>{
  const busy=buildAgentListing({self:'current [abc123]',sessions:[{name:'worker',ref:'ff0123'}],canSend:false})
  assert.match(busy.listing,/None of the agents below can be messaged with SendMessage/)
  const empty=buildAgentListing({self:'current [abc123]',canSend:false})
  assert.match(empty.listing,/No reachable agents/)
  assert.doesNotMatch(empty.listing,/peer messaging itself is available/)
})
test('ListAgents uses live bound socket and passed tools rather than fake self identity',async()=>{
  const mod=await source('src/tools/ListAgentsTool/ListAgentsTool.ts')
  assert.match(mod,/getMessagingSocketPath\(\)/)
  assert.doesNotMatch(mod,/getSessionId\(\)\.slice/)
  assert.match(mod,/canSendMessage\(options\.refreshTools\?\.\(\) \?\? options\.tools\)/)
  assert.doesNotMatch(mod,/canSend:\s*true/)
})
test('duplicate names must use an unambiguous ref',()=>{
  const a={name:'worker',ref:peerRef('/tmp/a.sock'),address:'uds:/tmp/a.sock'}
  const b={name:'worker',ref:peerRef('/tmp/b.sock'),address:'uds:/tmp/b.sock'}
  assert.equal(resolveLocalPeerAddress([a,b],'worker'),undefined)
  assert.equal(resolveLocalPeerAddress([a,b],`worker [${b.ref}]`),b.address)
  assert.equal(resolveLocalPeerAddress([a,b],'missing'),undefined)
})
test('live sessions require a real process and a bound Unix socket',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'m1-peer-'))
  const socket=join(dir,'fixture.sock')
  const child=spawn(process.execPath,['-e',`const net=require('node:net');const srv=net.createServer(s=>s.end('OK\\n'));srv.listen(process.argv[1],()=>process.stdout.write('READY\\n'))`,socket],{stdio:['ignore','pipe','pipe']})
  try {
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('socket fixture timed out')),5000)
      child.stdout.on('data',data=>{if(data.toString().includes('READY')){clearTimeout(timeout);resolve()}})
      child.once('error',reject)
      child.once('exit',code=>reject(new Error(`socket fixture exited ${code}`)))
    })
    await writeFile(join(dir,`${child.pid}.json`),JSON.stringify({pid:child.pid,sessionId:'live',name:'reachable',messagingSocketPath:socket}))
    await writeFile(join(dir,'99999999.json'),JSON.stringify({pid:99999999,name:'stale',messagingSocketPath:socket}))
    await writeFile(join(dir,'invalid.json'),'{}')
    const r=await listLiveLocalPeers(dir)
    assert.equal(r.unreadable,false)
    assert.deepEqual(r.peers.map(p=>p.name),['reachable'])
    assert.equal(resolveLocalPeerAddress(r.peers,'reachable'),`uds:${socket}`)
  } finally {
    child.kill()
    await rm(dir,{force:true,recursive:true})
  }
})
test('tools registration, alias, output, gate and receiver are wired',async()=>{
  const [mod,pool,setup,sender,recv]=await Promise.all([
    source('src/tools/ListAgentsTool/ListAgentsTool.ts'),source('src/tools.ts'),
    source('src/setup.ts'),source('src/tools/SendMessageTool/SendMessageTool.ts'),
    source('src/utils/udsMessaging.ts')])
  assert.match(mod,/name: 'ListAgents'/)
  assert.match(mod,/aliases: \['ListPeers'\]/)
  assert.match(mod,/z\.string\(\)\.max\(256\)\.optional\(\)/)
  assert.match(mod,/listing: z\.string\(\)/)
  assert.match(mod,/isEnabled\(\) \{ return isCrossSessionMessagingEnabled\(\) \}/)
  assert.match(pool,/ListAgentsTool,/)
  assert.match(setup,/startUdsMessaging\(/)
  assert.match(sender,/resolveUnifiedPeerRecipient\(/)
  assert.match(recv,/enqueuePendingNotification\(/)
})
test('cross-session gate and acknowledgements are explicit',async()=>{
  const [gate,client,server]=await Promise.all([source('src/utils/crossSessionMessaging.ts'),source('src/utils/udsClient.ts'),source('src/utils/udsMessaging.ts')])
  assert.match(gate,/CLAUDE_CODE_HARBOR_KITE/)
  assert.match(client,/line === 'OK'/)
  assert.match(client,/setTimeout\(5000\)/)
  assert.match(server,/chmod\(socketPath, 0o600\)/)
  assert.match(server,/socket\.end\('OK\\n'\)/)
})
