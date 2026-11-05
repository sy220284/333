import test from 'node:test'
import assert from 'node:assert/strict'
import { gatewayOidcPrincipal317 } from '../src/cli/gateway/gatewayAuth317.ts'
import { validateGatewayConfig317 } from '../src/cli/gateway/gatewayConfig317.ts'
import { createGatewayDeviceFlow317 } from '../src/cli/gateway/gatewayDevice317.ts'

const secret='0123456789abcdef'.repeat(4)
const oidc={issuer:'https://idp.example.test',client_id:'client',user_id_claim:'oid'}
function setup(override={}) {
 return validateGatewayConfig317({
  listen:{host:'127.0.0.1',port:41881},store:{postgres_url:'postgres://localhost/gw'},
  session:{jwt_secret:secret},oidc:{...oidc,...override},
  upstreams:[{name:'only',provider:'anthropic',auth:{api_key:'test-secret'}}],
 })
}
test('317 OIDC config preserves nonempty user_id_claim and sub default',()=>{
 assert.equal(setup().oidc.user_id_claim,'oid')
 assert.equal(setup({user_id_claim:undefined}).oidc.user_id_claim,undefined)
 for (const value of ['',null,0]) assert.throws(()=>setup({user_id_claim:value}),/oidc.user_id_claim/)
})
test('317 OIDC principal chooses configured claim while requiring original IdP sub',()=>{
 const idp={sub:'directory-subject',oid:'tenant-guid',email:'user@example.test'}
 assert.equal(gatewayOidcPrincipal317(idp),'directory-subject')
 assert.equal(gatewayOidcPrincipal317(idp,'oid'),'tenant-guid')
 assert.equal(gatewayOidcPrincipal317({...idp,oid:'second-tenant'},'oid'),'second-tenant')
})
test('317 OIDC rejects missing custom claim with upstream error code',()=>{
 const idp={sub:'directory-subject'}
 assert.throws(()=>gatewayOidcPrincipal317(idp,'oid'),error=>error.code==='USER_ID_CLAIM_MISSING' && error.message.includes('oid'))
 assert.throws(()=>gatewayOidcPrincipal317({sub:'',oid:'guid'},'oid'),/required `sub`/)
 assert.throws(()=>gatewayOidcPrincipal317({sub:'subject',oid:42},'oid'),error=>error.code==='USER_ID_CLAIM_MISSING')
})
test('317 device callback persists and audits the configured principal',async()=>{
 const stored=[]; const audits=[]; let userCode='';
 const store={
  async incrementRateLimit(){return 1}, async audit(...x){audits.push(x)},
  async newDevice(_device,code){userCode=code}, async denyCode(){return true},
  async approveCode(code,claims){stored.push({code,claims});return true},
  async consumeDevice(){return {status:'pending'}}, async createRefresh(){},
  async rotateRefresh(){return null},async revoke(){},
 }
 const idp={
  authorize:({state})=>'https://idp.example.test/?state='+state,
  exchange:async()=>({sub:'idp-sub',oid:'mapped-id',email:'a@example.test',groups:['staff']}),
 }
 const flow=createGatewayDeviceFlow317({publicUrl:'http://127.0.0.1:41881',
  config:{session:{jwt_secret:secret,ttl_hours:1},rate_limits:{
   device_authorization:{max:10,window_seconds:60},device_verify:{max:10,window_seconds:60}},
   oidc:{user_id_claim:'oid'}},oidc:idp,store})
 const started=await flow.deviceAuthorization(new Request('http://127.0.0.1:41881/oauth/device_authorization',{method:'POST',body:''}),null)
 assert.equal(started.status,200)
 const data=await started.json()
 const verification=await flow.verifyDevice(new Request('http://127.0.0.1:41881/device',{method:'POST',headers:{'sec-fetch-site':'same-origin'},body:new URLSearchParams({user_code:data.user_code})}),null)
 assert.equal(verification.status,303)
 const state=new URL(verification.headers.get('location')).searchParams.get('state')
 const callback=await flow.callback(new Request('http://127.0.0.1:41881/oauth/callback?state='+state+'&code=valid'))
 assert.equal(callback.status,200)
 assert.equal(stored.length,1)
 assert.equal(stored[0].claims.sub,'mapped-id')
 assert.equal(audits.find(x=>x[0]==='device.approved')?.[1],'mapped-id')
})
