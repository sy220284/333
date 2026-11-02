import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { canonicalId, peerIdentityKey, discoverAccountPeers, mergeSessionPeers, resolveRemoteRecipient,
  rememberAccountRecipients, resolveAdvertisedRemoteRecipient, resolveUnifiedPeerRecipient } from '../src/utils/accountPeerDirectory.mjs'
test('cse and session aliases deduplicate, local endpoint wins',()=>{
  assert.equal(canonicalId('session_ab'),canonicalId('cse_ab'))
  const peers=mergeSessionPeers({local:[{bridgeSessionId:'session_local'}],
    cloud:[{id:'cse_local',title:'shadow'},{id:'cse_first',title:'cloud',status:'active'}],
    bridge:[{id:'session_first',title:'duplicate'},{id:'session_second',title:'remote',status:'active'}]})
  assert.deepEqual(peers.map(p=>p.name),['cloud','remote'])
  assert.equal(peers[1].address,'bridge:session_second')
})
test('both account APIs paginate and carry authentication without listing secrets',async()=>{
 const urls=[]
 const request=async (url,headers)=>{
  urls.push({url,headers})
  const parsed=new URL(url)
  if(parsed.pathname==='/v1/code/sessions'){
    return {status:200,data:{data:[{id:`cse_${parsed.searchParams.has('cursor')?'two':'one'}`,title:'cloud',status:'active'}],
      next_cursor:parsed.searchParams.has('cursor')?null:'next'}}
  }
  return {status:200,data:{data:[{id:'session_three',title:'bridge',session_status:'active'}],has_more:false}}
 }
 const found=await discoverAccountPeers({request,baseUrl:'https://example.test/',
   accessToken:'token',orgUUID:'org'})
 assert.equal(found.peers.length,3)
 assert.equal(urls.length,3)
 assert.equal(urls[0].headers.Authorization,'Bearer token')
 assert.equal(urls[1].headers['x-organization-uuid'],'org')
 assert.equal(urls[2].url.includes('cursor=next'),true)
})
test('opt-out, offline, ambiguous and expired recipients cannot be routed',()=>{
 const peers=mergeSessionPeers({bridge:[{id:'session_one',title:'same',status:'active'},
   {id:'session_two',title:'same',status:'active'},
   {id:'session_closed',title:'closed',acceptsPeerMessages:false}]})
 assert.equal(resolveRemoteRecipient(peers,'same'),undefined)
 assert.equal(resolveRemoteRecipient(peers,`same [${peers[0].ref}]`),peers[0].address)
 assert.equal(resolveRemoteRecipient(peers,'closed'),undefined)
 rememberAccountRecipients(peers,100)
 assert.equal(resolveAdvertisedRemoteRecipient('same',120),undefined)
 assert.equal(resolveAdvertisedRemoteRecipient('same [one]',31001),undefined)
})
test('failed authenticated API adds note without concealing successful source',async()=>{
 const found=await discoverAccountPeers({baseUrl:'https://example.test',accessToken:'test',orgUUID:'org',
  request:async url=>new URL(url).pathname==='/v1/sessions'?{status:500,data:{}}:
  {status:200,data:{data:[{id:'cse_ok',title:'cloud',status:'active'}]}}})
 assert.equal(found.peers.length,1)
 assert.equal(found.notes[0].kind,'account_list_failed')
})
test('no login does not access remote APIs',async()=>{
 let calls=0
 const found=await discoverAccountPeers({baseUrl:'https://example.test',request:async()=>{calls++}})
 assert.equal(calls,0);assert.equal(found.available,false)
})

test('same name on UDS and Remote Control is never silently routed to one transport',()=>{
  const local=[{name:'collide',ref:'123abc',address:'uds:/tmp/one'}]
  const remote=mergeSessionPeers({bridge:[{id:'session_something',title:'collide',status:'active'}]})
  rememberAccountRecipients(remote,1000)
  assert.deepEqual(resolveUnifiedPeerRecipient(local,'collide',1100),{address:undefined,ambiguous:true})
  assert.equal(resolveUnifiedPeerRecipient(local,'collide [123abc]',1100).address,'uds:/tmp/one')
  assert.equal(resolveUnifiedPeerRecipient(local,`collide [${remote[0].ref}]`,1100).address,remote[0].address)
})

test('cloud-only session must not advertise a guessed bridge delivery address', () => {
 const peers=mergeSessionPeers({cloud:[{id:'cse_alone',title:'Cloud only',status:'active'}]})
 assert.equal(peers.length,1)
 assert.equal(peers[0].address,undefined)
 assert.equal(peers[0].unreachableFromHere,true)
 assert.equal(resolveRemoteRecipient(peers,'Cloud only'),undefined)
 rememberAccountRecipients(peers,1000)
 assert.equal(resolveAdvertisedRemoteRecipient('Cloud only',1100),undefined)
})
test('cloud + Remote Control share one listing entry with the real connected route', () => {
 const args={
   cloud:[{id:'cse_shared',title:'Cloud job',status:'active'}],
   bridge:[{id:'session_shared',title:'Remote duplicate',status:'active'}],
 }
 const peers=mergeSessionPeers(args)
 assert.equal(peers.length,1)
 assert.equal(peers[0].name,'Cloud job')
 assert.equal(peers[0].address,'bridge:session_shared')
 assert.equal(resolveRemoteRecipient(peers,'Cloud job'),peers[0].address)
 const offline=mergeSessionPeers({cloud:args.cloud,bridge:[{...args.bridge[0],offline:true}]})
 assert.equal(offline[0].address,undefined)
})

test('a reconnected live Remote Control supersedes an offline cloud snapshot', () => {
 const peers=mergeSessionPeers({
   cloud:[{id:'cse_recovery',title:'Cloud snapshot',offline:true,status:'offline'}],
   bridge:[{id:'session_recovery',title:'Live Remote Control',status:'active'}],
 })
 assert.equal(peers.length,1)
 assert.equal(peers[0].status,'active')
 assert.equal(peers[0].unreachableFromHere,false)
 assert.equal(peers[0].address,'bridge:session_recovery')
 assert.equal(resolveRemoteRecipient(peers,'Cloud snapshot'),'bridge:session_recovery')
})
test('a live bridge does not override an explicit no-peer-messaging policy', () => {
 const peers=mergeSessionPeers({
   cloud:[{id:'cse_policy',title:'Restricted',status:'active',acceptsPeerMessages:false}],
   bridge:[{id:'session_policy',status:'active',acceptsPeerMessages:true}],
 })
 assert.equal(peers.length,1)
 assert.equal(peers[0].unreachableFromHere,true)
 assert.equal(peers[0].address,undefined)
})

test('cloud API failure does not disable an independently verified Remote Control route',async()=>{
 const peers=await discoverAccountPeers({
  baseUrl:'https://example.test',accessToken:'test',orgUUID:'org',
  request:async url=>new URL(url).pathname==='/v1/sessions'
    ? {status:200,data:{data:[{id:'session_ok',title:'Live',status:'active'}],has_more:false}}
    : {status:503,data:{}},
 })
 assert.equal(peers.peers.length,1)
 assert.equal(peers.peers[0].address,'bridge:session_ok')
 assert.equal(peers.peers[0].unreachableFromHere,false)
 assert.equal(peers.notes.some(note=>note.kind==='cloud_list_failed'),true)
})
test('nonterminating or truncated pagination never yields an addressable peer',async()=>{
 const result=await discoverAccountPeers({
  baseUrl:'https://example.test',accessToken:'test',orgUUID:'org',
  request:async url=>new URL(url).pathname==='/v1/sessions'
    ? {status:200,data:{data:[{id:'session_loop',title:'Loop',status:'active'}],
      has_more:true,last_id:'repeated'}}
    : {status:200,data:{data:[]}},
 })
 assert.equal(result.peers.length,1)
 assert.equal(result.peers[0].address,undefined)
 assert.equal(result.notes.some(note=>note.kind==='account_list_failed'),true)
 assert.equal(result.notes.some(note=>note.kind==='list_truncated'),true)
})


test('credential-scoped session advertisement rejects previous login and organization',()=>{
 const original=peerIdentityKey('token-old','org-a')
 const renewed=peerIdentityKey('token-new','org-a')
 const switchedOrg=peerIdentityKey('token-old','org-b')
 assert.ok(original && renewed && switchedOrg)
 assert.notEqual(original,renewed)
 assert.notEqual(original,switchedOrg)
 assert.equal(peerIdentityKey(undefined,'org-a'),null)
 assert.equal(peerIdentityKey('token-old',undefined),null)
 const remote=mergeSessionPeers({bridge:[{id:'session_sensitive',title:'worker',status:'active'}]})
 rememberAccountRecipients(remote,5000,original)
 assert.equal(resolveAdvertisedRemoteRecipient('worker',5100,original),remote[0].address)
 assert.equal(resolveAdvertisedRemoteRecipient('worker',5100,renewed),undefined)
 assert.equal(resolveAdvertisedRemoteRecipient('worker',5100,switchedOrg),undefined)
 assert.equal(resolveAdvertisedRemoteRecipient('worker',5100,null),undefined)
 assert.deepEqual(resolveUnifiedPeerRecipient([],'worker',5100,renewed),{address:undefined,ambiguous:false})
 // Local-only routing stays available after account switch; never reuses remote.
 const local=[{name:'local',address:'uds:/tmp/only',ref:'123456'}]
 assert.equal(resolveUnifiedPeerRecipient(local,'local',5100,switchedOrg).address,'uds:/tmp/only')
 assert.equal(resolveUnifiedPeerRecipient(local,'worker',5100,original).address,remote[0].address)
 assert.equal(resolveAdvertisedRemoteRecipient('worker',35001,original),undefined)
})


test('account identity verification is wired through list, permission, validation and dispatch',async()=>{
 const source=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8')
 const [listing,sending,discovery]=await Promise.all([
   source('src/tools/ListAgentsTool/ListAgentsTool.ts'),
   source('src/tools/SendMessageTool/SendMessageTool.ts'),
   source('src/bridge/peerDiscovery.ts'),
 ])
 assert.match(listing,/discoveredAccount\.identityKey === currentIdentity/)
 assert.match(listing,/rememberAccountRecipients\(account\.peers, Date\.now\(\), account\.identityKey\)/)
 assert.equal((sending.match(/await getCurrentPeerIdentityKey\(\)/g)||[]).length,4)
 assert.match(sending,/async checkPermissions/)
 assert.match(sending,/async validateInput/)
 assert.match(sending,/async call\(/)
 assert.match(discovery,/peerIdentityKey\(credentials\.accessToken, credentials\.orgUUID\)/)
 const bridge=await source('src/bridge/peerSessions.ts')
 assert.match(bridge,/peerIdentityKey\(accessToken, orgUUID\) !== expectedIdentityKey/)
 assert.match(sending,/postInterClaudeMessage\([\s\S]*?currentIdentityKey,\s*\)/)
})


test('remote transport connectivity and remote worker action status remain distinct',()=>{
 const disconnected=mergeSessionPeers({
   cloud:[{id:'cse_status',title:'Waiting',status:'active',workerStatus:'active'}],
   bridge:[{id:'session_status',title:'Connection',status:'active',offline:true}],
 })
 assert.equal(disconnected[0].status,'offline')
 assert.equal(disconnected[0].unreachableFromHere,true)
 assert.equal(disconnected[0].address,undefined)
 const waiting=mergeSessionPeers({
   cloud:[{id:'cse_status',title:'Waiting',status:'active',workerStatus:'requires_action'}],
   bridge:[{id:'session_status',title:'Connection',status:'active'}],
 })
 assert.equal(waiting[0].status,'requires_action')
 assert.equal(waiting[0].unreachableFromHere,false)
 assert.equal(waiting[0].address,'bridge:session_status')
})
