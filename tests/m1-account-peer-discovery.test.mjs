import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalId, discoverAccountPeers, mergeSessionPeers, resolveRemoteRecipient,
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
    return {status:200,data:{data:[{id:'cse_'+(parsed.searchParams.has('cursor')?'two':'one'),title:'cloud',status:'active'}],
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
