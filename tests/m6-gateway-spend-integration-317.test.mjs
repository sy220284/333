import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createGatewayService317 } from '../src/cli/gateway/gatewayServer317.mjs'
import { validateGatewayConfig317 } from '../src/cli/gateway/gatewayConfig317.mjs'
import { signGatewaySession317 } from '../src/cli/gateway/gatewayAuth317.mjs'

const secret = 'test-jwt-secret-value-32-bytes-xxxxxxxxxxxxxxxx'
const readKey = 'read-' + 'a'.repeat(40)
const writeKey = 'write-' + 'b'.repeat(40)
const origin = 'http://127.0.0.1:49174'

function storeFixture(spend) {
  return {
    audits:[], initialized:0, closed:0,
    async isRevoked(){return false},
    async audit(...args){this.audits.push(args)},
    async createSpend(){this.initialized++;return spend},
    async close(){this.closed++},
  }
}
function spendFixture() {
  return {
    spent:100, limit:1000, calls:[],
    async getApplicableCaps(identity){
      return [{id:'spl_'+'f'.repeat(32),type:'spend_limit',
        scope:{type:'user',user_id:identity.sub},period:'monthly',
        amount:String(this.limit)}]
    },
    async getSpend(){return this.spent},
    async getPoolSpend(){return 0},
    async addSpend(identity,cents,at,group){
      this.calls.push(['meter',identity.sub,cents,group]);this.spent+=cents
    },
    async list(){return {data:[],has_more:false}},
    async upsert(value,actor){this.calls.push(['admin',actor]);return value},
  }
}
test('317 gateway: admin routes, admission spend wall, upstream cost meter and usage',async()=>{
  const previous=globalThis.Bun
  globalThis.Bun={serve(){throw new Error('use injected serve')}}
  let calls=0
  const upstream=createServer((request,response)=>{
    calls++
    assert.equal(request.headers['x-api-key'],'upstream-secret')
    response.setHeader('content-type','application/json')
    response.end(JSON.stringify({id:'msg_1',usage:{input_tokens:1000000,output_tokens:0}}))
  })
  upstream.listen(0,'127.0.0.1')
  await once(upstream,'listening')
  const config=validateGatewayConfig317({
    listen:{host:'127.0.0.1',port:49174},
    store:{postgres_url:'postgres://localhost:5432/gateway'},
    session:{jwt_secret:secret},
    oidc:{issuer:'https://login.example.test',client_id:'client'},
    upstreams:[{name:'upstream',provider:'anthropic',
      base_url:'http://127.0.0.1:'+upstream.address().port,
      auth:{api_key:'upstream-secret'},models:['claude-sonnet-demo']}],
    admin:{read_keys:[{id:'read',key:readKey}],
      write_keys:[{id:'write',key:writeKey}],admin_groups:['admin']},
  })
  const spend=spendFixture(),store=storeFixture(spend)
  let handler,app
  try {
    app=await createGatewayService317(config,{
      store,oidc:{authorize(){return 'https://idp.example.test'},exchange:async()=>({sub:'x'})},
      serve(options){handler=options.fetch;return {port:49174,async stop(){}}},
    })
    const request=(path,{token,key,method='GET',body}={})=>
      handler(new Request(origin+path,{method,headers:{
        ...(token?{authorization:'Bearer '+token}:{}),
        ...(key?{'x-api-key':key}:{}),
        ...(body?{'content-type':'application/json'}:{}),
      },...(body?{body:JSON.stringify(body)}:{})}),
      {requestIP(){return {address:'127.0.0.1'}}})
    const user=signGatewaySession317({sub:'employee',groups:['eng']},secret,origin,1)
    const input={model:'claude-sonnet-demo',messages:[],max_tokens:5}
    assert.equal(store.initialized,1)
    assert.equal((await request('/v1/organizations/spend_limits')).status,401)
    assert.equal((await request('/v1/organizations/spend_limits',{key:readKey})).status,200)
    const update={scope:{type:'user',user_id:'employee'},period:'monthly',amount:'500'}
    assert.equal((await request('/v1/organizations/spend_limits',{key:readKey,method:'POST',body:update})).status,403)
    assert.equal((await request('/v1/organizations/spend_limits',{key:writeKey,method:'POST',body:update})).status,200)
    assert.equal((await request('/v1/messages',{method:'POST',body:input})).status,401)
    const accepted=await request('/v1/messages',{token:user,method:'POST',body:input})
    assert.equal(accepted.status,200)
    assert.equal(accepted.headers.get('anthropic-ratelimit-unified-status'),'allowed')
    await accepted.text()
    assert.equal(calls,1)
    assert.ok(spend.calls.some(x=>x[0]==='meter'&&x[1]==='employee'&&x[2]>0))
    const usage=await request('/api/oauth/usage',{token:user})
    assert.equal(usage.status,200)
    assert.ok((await usage.json()).limits.length>0)
    spend.spent=spend.limit+1
    const blocked=await request('/v1/messages',{token:user,method:'POST',body:input})
    assert.equal(blocked.status,429)
    assert.equal(blocked.headers.get('anthropic-ratelimit-unified-status'),'rejected')
    assert.equal(calls,1)
    assert.ok(store.audits.some(a=>a[0]==='spend.metered'))
  }finally{
    if(app)await app.close()
    globalThis.Bun=previous
    await new Promise((ok,bad)=>upstream.close(error=>error?bad(error):ok()))
  }
  assert.equal(store.closed,1)
})
test('317 gateway: missing durable spend initializer aborts startup',async()=>{
  const old=globalThis.Bun
  globalThis.Bun={serve(){}}
  try{
    const config=validateGatewayConfig317({
      listen:{host:'127.0.0.1',port:49174},
      store:{postgres_url:'postgres://localhost/gateway'},
      session:{jwt_secret:secret},
      oidc:{issuer:'https://idp.example.test',client_id:'idp'},
      upstreams:[{name:'upstream',provider:'anthropic',auth:{api_key:'server'},
        base_url:'https://api.anthropic.com'}],
      admin:{read_keys:[{id:'read',key:readKey}]},
    })
    await assert.rejects(createGatewayService317(config,{
      store:{async close(){}},oidc:{},
      serve(){throw new Error('socket must not open')},
    }),/createSpend/)
  }finally{globalThis.Bun=old}
})
