import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGatewayDeviceFlow317 } from '../src/cli/gateway/gatewayDevice317.mjs'
import { validateGatewayConfig317 } from '../src/cli/gateway/gatewayConfig317.mjs'

const publicUrl='http://127.0.0.1:49170'
const config=()=>validateGatewayConfig317({
  listen:{host:'127.0.0.1',port:49170},
  store:{postgres_url:'postgres://localhost:5432/gateway'},
  session:{jwt_secret:'s'.repeat(64)},
  oidc:{issuer:'https://idp.example.test',client_id:'idp'},
  upstreams:[{name:'api',provider:'anthropic',auth:{api_key:'secret'}}],
  rate_limits:{device_authorization:{max:1,window_seconds:90},
    device_verify:{max:1,window_seconds:90}},
})
const makeStore=()=>({
  counters:new Map(),keys:[],codes:new Set(),audits:[],
  async incrementRateLimit(kind,clientIp,windowSeconds){
    this.keys.push([kind,clientIp,windowSeconds])
    const key=kind+':'+clientIp,count=(this.counters.get(key)??0)+1
    this.counters.set(key,count);return count
  },
  async newDevice(_token,code){this.codes.add(code)},
  async denyCode(code){return this.codes.delete(code)},
  async audit(...args){this.audits.push(args)},
})
const idp={authorize:({state})=>'https://idp.example.test/login?state='+state}
const startRequest=()=>new Request(publicUrl+'/oauth/device_authorization',{
  method:'POST',body:new URLSearchParams({surface:'cli'}),
})
const verifyRequest=(code,origin=publicUrl)=>new Request(publicUrl+'/device',{
  method:'POST',headers:{origin},body:new URLSearchParams({user_code:code}),
})
test('317 gateway: shared counter enforces the configured IP limits across gateway instances',async()=>{
  const store=makeStore()
  const flow1=createGatewayDeviceFlow317({publicUrl,config:config(),oidc:idp,store})
  const flow2=createGatewayDeviceFlow317({publicUrl,config:config(),oidc:idp,store})
  const started=await flow1.deviceAuthorization(startRequest(),'10.0.0.1')
  assert.equal(started.status,200)
  const {user_code}=await started.json()
  const throttled=await flow2.deviceAuthorization(startRequest(),'10.0.0.1')
  assert.equal(throttled.status,429)
  assert.deepEqual(store.keys.slice(0,2),[
    ['devauth','10.0.0.1',90],['devauth','10.0.0.1',90]])
  const csrf=await flow1.verifyDevice(verifyRequest(user_code,'https://evil.example'),'10.0.0.1')
  assert.equal(csrf.status,403)
  assert.equal(store.keys.length,2)
  assert.equal((await flow2.verifyDevice(verifyRequest(user_code),'10.0.0.1')).status,303)
  assert.equal((await flow1.verifyDevice(verifyRequest(user_code),'10.0.0.1')).status,429)
  assert.deepEqual(store.keys.slice(-2),[['device','10.0.0.1',90],['device','10.0.0.1',90]])
  assert.equal(store.audits.some(item=>item[0]==='device.verify'&&item[3]?.result==='csrf_rejected'),true)
})
test('317 gateway: device denial consumes pending code and rejects foreign origins',async()=>{
  const store=makeStore(),flow=createGatewayDeviceFlow317({publicUrl,config:config(),oidc:idp,store})
  const {user_code}=await (await flow.deviceAuthorization(startRequest(),'10.0.0.1')).json()
  const make=(origin)=>new Request(publicUrl+'/device/deny',{
    method:'POST',headers:{origin},body:new URLSearchParams({user_code}),
  })
  assert.equal((await flow.denyDevice(make('https://evil.example'),'10.0.0.1')).status,403)
  assert.equal((await flow.denyDevice(make(publicUrl),'10.0.0.1')).status,200)
  assert.equal(store.codes.has(user_code.replaceAll('-','')),false)
})
test('317 gateway: invalid device rate policy fails config validation',()=>{
  assert.throws(()=>validateGatewayConfig317({
    ...config(),rate_limits:{device_verify:{max:0,window_seconds:60}},
  }),/rate_limits.device_verify.max/)
})
