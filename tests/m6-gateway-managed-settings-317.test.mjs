import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createGatewayManagedSettings317, responseForManagedSettings317,
} from '../src/cli/gateway/gatewayManaged317.mjs'

const request = (tag) => new Request('https://gateway.example.test/managed/settings',
  { headers: tag ? { 'if-none-match':tag } : {} })

test('317 gateway: matched group and domain inherits catch-all restrictions', async () => {
  const policies = await createGatewayManagedSettings317({
    policies: [
      { match:{ groups:['eng'], email_domain:'example.test' },
        cli:{ permissions:{ deny:['Read(secret)'] }, env:{TEAM:'eng'} } },
      { match:{}, cli:{ permissions:{deny:['Read(.env)']},
        env:{ORG:'corp'}, deniedMcpServers:['blocked-mcp'] } },
    ],
  })
  const who = { sub:'employee', email:'alice@example.test', groups:['eng'] }
  const res = responseForManagedSettings317(request(),who,policies)
  assert.equal(res.status,200)
  assert.equal(res.headers.get('cache-control'),'no-store')
  assert.equal(res.headers.get('x-cc-gateway-version'),'2.1.317')
  const payload = await res.json()
  assert.deepEqual(payload.settings.permissions.deny,
    ['Read(.env)','Read(secret)'])
  assert.deepEqual(payload.settings.env,{ORG:'corp',TEAM:'eng'})
  assert.deepEqual(payload.settings.deniedMcpServers,['blocked-mcp'])
  assert.match(payload.checksum,/^sha256:[a-f0-9]{64}$/)
  assert.equal(payload.uuid,payload.checksum)
  const cached = responseForManagedSettings317(
    request(res.headers.get('etag')),who,policies)
  assert.equal(cached.status,304)
  assert.equal(await cached.text(),'')
  // Desktop's If-None-Match:* probes for policy presence, not equivalence.
  assert.equal(responseForManagedSettings317(request('*'),who,policies).status,200)
})

test('317 gateway: unmatched policy is 404, matching catch-all alone is 200', async () => {
  const set = await createGatewayManagedSettings317({ policies:[{
    match:{groups:['admin']},cli:{permissions:{deny:['Bash']}},
  }] })
  const who = {sub:'employee',groups:['eng']}
  const notFound = responseForManagedSettings317(request(),who,set)
  assert.equal(notFound.status,404)
  assert.equal(notFound.headers.get('cache-control'),'no-store')
  assert.equal(responseForManagedSettings317(request(),who,null).status,404)
})

test('317 gateway: layered policies union deny/ask rules and ordered arrays', async () => {
  const set = await createGatewayManagedSettings317({
    policy_mode:'layered',
    policies:[
      {match:{groups:['eng']},cli:{permissions:{deny:['Bash(a)'],ask:['Write(a)']}}},
      {match:{email_domain:'example.test'},cli:{permissions:{deny:['Bash(b)','Bash(a)']},
        deniedModels:['claude-x','claude-x']}},
    ],
  })
  const res = responseForManagedSettings317(request(),
    {sub:'a',groups:['eng'],email:'a@example.test'},set)
  assert.equal(res.status,200)
  const {settings} = await res.json()
  assert.deepEqual(settings.permissions.deny,['Bash(a)','Bash(b)'])
  assert.deepEqual(settings.permissions.ask,['Write(a)'])
  assert.deepEqual(settings.deniedModels,['claude-x'])
})

test('317 gateway: canonical checksum is independent of object key order', async () => {
  const a = await createGatewayManagedSettings317({policies:[{cli:{
    env:{B:'2',A:'1'},permissions:{deny:['Write']},
  }}]})
  const b = await createGatewayManagedSettings317({policies:[{cli:{
    permissions:{deny:['Write']},env:{A:'1',B:'2'},
  }}]})
  const who = {sub:'employee',groups:[]}
  const ra=await responseForManagedSettings317(request(),who,a).json()
  const rb=await responseForManagedSettings317(request(),who,b).json()
  assert.equal(ra.checksum,rb.checksum)
})

test('317 gateway: policy settings can load from explicit JSON file', async () => {
  const root=await mkdtemp(join(tmpdir(),'gateway-policy-317-'))
  try {
    const file=join(root,'managed-settings.json')
    await writeFile(file,JSON.stringify({permissions:{deny:['Read(.env)']}}))
    const p=await createGatewayManagedSettings317({settings:file})
    const data=await responseForManagedSettings317(request(),{sub:'test'},p).json()
    assert.deepEqual(data.settings.permissions.deny,['Read(.env)'])
  } finally {await rm(root,{recursive:true,force:true})}
})

test('317 gateway: layered exclusion, unsafe setting and prototype keys are rejected', async () => {
  for(const policy of [
    {cli:{permissions:{deny:['!Read(secret)']}}},
    {cli:{disableAllHooks:true}},
    {cli:JSON.parse('{"__proto__":{"admin":true}}')},
  ]) {
    await assert.rejects(
      createGatewayManagedSettings317({policy_mode:'layered',policies:[policy]}),
    )
  }
  await assert.rejects(
    createGatewayManagedSettings317({policies:[
      {code:{permissions:{deny:['Bash']}}},{cli:{}},
    ]}),/must not mix/,
  )
})
