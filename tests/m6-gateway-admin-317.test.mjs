import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  validateGatewayAdmin317, identifyGatewayAdmin317,
  parseGatewaySpendLimit317, handleGatewayAdmin317,
} from '../src/cli/gateway/gatewayAdmin317.mjs'
import { signGatewaySession317 } from '../src/cli/gateway/gatewayAuth317.mjs'
import { spendPeriodStart317, spendPeriodReset317 } from '../src/cli/gateway/gatewaySpendStore317.mjs'

const origin='https://gateway.example.test'
const secret='jwt-secret-0123456789abcdef'.repeat(3)
const readKey='read-key-'+ 'r'.repeat(48)
const writeKey='write-key-'+ 'w'.repeat(48)
function ctx() {
  const admin=validateGatewayAdmin317({
    read_keys:[{id:'read',key:readKey}],
    write_keys:[{id:'write',key:writeKey}],
    admin_groups:['admin'],group_limit_mode:'min',
  })
  const calls=[]
  const limit={type:'spend_limit',id:'spl_'+'a'.repeat(32),amount:'1000',
    period:'monthly',currency:'USD',scope:{type:'user',user_id:'alice'}}
  const spend={
    async list() { calls.push('list'); return {data:[limit],has_more:false} },
    async upsert(body,actor) {calls.push('upsert:'+actor);return {...limit,amount:body.amount}},
    async read() {calls.push('read');return limit},
    async delete() {calls.push('delete');return true},
    async listAudit() {calls.push('audit');return {data:[],has_more:false}},
    async getApplicableCaps() {calls.push('effective');return [limit]},
    async getSpend() {calls.push('spent');return 55.75},
  }
  return { config:{ admin, session:{jwt_secret:secret} },publicUrl:origin,spend,calls,
    audit: async () => {}}
}
const req=(path,key,method='GET',body)=>new Request(origin+path,{
  method,headers:{...(key?{'x-api-key':key}:{}),...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),
})
test('317 gateway admin: validate scoped read and write keys, reject duplicate IDs',()=>{
  const context=ctx()
  assert.equal(identifyGatewayAdmin317(req('/anything',writeKey),context.config,origin).canWrite,true)
  assert.equal(identifyGatewayAdmin317(req('/anything',readKey),context.config,origin).canWrite,false)
  assert.equal(identifyGatewayAdmin317(req('/anything','wrong'),context.config,origin),null)
  assert.throws(()=>validateGatewayAdmin317({
    read_keys:[{id:'duplicate',key:readKey}],
    write_keys:[{id:'duplicate',key:writeKey}],
  }),/Duplicate admin key id/)
  assert.throws(()=>validateGatewayAdmin317({write_keys:[{id:'short',key:'short'}]}),/32 bytes/)
})
test('317 gateway admin: GET list allowed for read key, POST limited to write scope',async()=>{
  const c=ctx()
  const root='/v1/organizations/spend_limits'
  const list=await handleGatewayAdmin317(req(root,readKey),c)
  assert.equal(list.status,200)
  assert.equal((await list.json()).data[0].id,'spl_'+'a'.repeat(32))
  const body={scope:{type:'user',user_id:'alice'},amount:'1750',period:'monthly'}
  const forbidden=await handleGatewayAdmin317(req(root,readKey,'POST',body),c)
  assert.equal(forbidden.status,403)
  assert.equal(c.calls.includes('upsert:admin-key:read'),false)
  const saved=await handleGatewayAdmin317(req(root,writeKey,'POST',body),c)
  assert.equal(saved.status,200)
  assert.equal((await saved.json()).amount,'1750')
  assert.ok(c.calls.includes('upsert:admin-key:write'))
  assert.equal(saved.headers.get('cache-control'),'no-store')
  assert.ok(saved.headers.get('request-id').startsWith('req_'))
})
test('317 gateway admin: Bearer OIDC group is admin, outsider is rejected',async()=>{
  const c=ctx()
  const path='/v1/organizations/spend_limits'
  const make=(groups)=>new Request(origin+path,{
    headers:{authorization:'Bearer '+signGatewaySession317({
      sub:'staff',groups,
    },secret,origin,1)},
  })
  assert.equal((await handleGatewayAdmin317(make(['admin']),c)).status,200)
  assert.equal((await handleGatewayAdmin317(make(['engineering']),c)).status,401)
  assert.equal((await handleGatewayAdmin317(req(path),c)).status,401)
})
test('317 gateway admin: validation rejects non-cent amounts, empty scope, mixed pooled limits',()=>{
  const base={scope:{type:'user',user_id:'alice'},period:'monthly',amount:'12'}
  assert.deepEqual(parseGatewaySpendLimit317(base).amount,'12')
  for(const body of [
    {...base,amount:12},
    {...base,amount:'1.5'},
    {...base,amount:'-1'},
    {...base,scope:{type:'user',user_id:''}},
    {...base,period:'yearly'},
    {...base,currency:'EUR'},
    {...base,pooled_budget:{amount:'500'}},
  ]) assert.throws(()=>parseGatewaySpendLimit317(body))
  assert.equal(parseGatewaySpendLimit317({
    scope:{type:'rbac_group',rbac_group_id:'eng'},period:'monthly',
    amount:'500',pooled_budget:{amount:'2000',paused:false},
  }).pooled_budget.amount,'2000')
})
test('317 gateway admin: ISO week/year and month buckets match native Postgres keys',()=>{
  assert.equal(spendPeriodStart317('monthly',new Date('2026-11-04T10:00:00Z')),'2026-11')
  assert.equal(spendPeriodStart317('daily',new Date('2026-11-04T10:00:00Z')),'2026-11-04')
  assert.equal(spendPeriodStart317('weekly',new Date('2026-12-31T10:00:00Z')),'2026-W53')
  assert.equal(spendPeriodStart317('weekly',new Date('2027-01-01T10:00:00Z')),'2026-W53')
  assert.equal(spendPeriodReset317('weekly',new Date('2027-01-01T10:00:00Z')).toISOString(),'2027-01-04T00:00:00.000Z')
})
