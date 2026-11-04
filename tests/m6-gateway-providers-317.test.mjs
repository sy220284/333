import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateGatewayConfig317 } from '../src/cli/gateway/gatewayConfig317.mjs'
import { forwardGatewaySdk317 } from '../src/cli/gateway/gatewayProviders317.ts'
import { forwardGatewayInference317 } from '../src/cli/gateway/gatewayForward317.mjs'

const credentials={api_key:'server-secret'}
const candidates=[
  {provider:'anthropic',auth:credentials},
  {provider:'bedrock',region:'us-east-1',auth:{}},
  {provider:'mantle',region:'us-east-1',models:['claude-opus-5'],auth:{}},
  {provider:'anthropicAws',region:'us-east-1',workspace_id:'ws-123',auth:{}},
  {provider:'anthropicGoogleCloud',project_id:'demo',workspace_id:'ws-123',auth:{}},
  {provider:'vertex',region:'us-east5',project_id:'demo',auth:{}},
  {provider:'foundry',resource:'azure-demo',auth:{api_key:'foundry-key'}},
]
function settings(upstreams){
  return {
    listen:{host:'127.0.0.1',port:0},
    store:{postgres_url:'postgres://127.0.0.1/gw'},
    session:{jwt_secret:'abcDEF123456'.repeat(5)},
    oidc:{issuer:'https://idp.example.org',client_id:'test'},
    upstreams:upstreams.map((o,i)=>({name:'u'+i,...o})),
    models:[{id:'claude-opus-5',upstream_model:Object.fromEntries(upstreams.map((_,i)=>['u'+i,'backend-model']))}],
  }
}
test('317 gateway: all seven original provider types pass canonical config with their credential constraints',()=>{
  const config=validateGatewayConfig317(settings(candidates))
  assert.deepEqual(config.upstreams.map(u=>u.provider),candidates.map(u=>u.provider))
  assert.equal(config.upstreams[4].location,'global')
  assert.throws(()=>validateGatewayConfig317(settings([{provider:'bedrock',region:'us-east-1',auth:{aws_access_key_id:'key'}}])),/access key and secret/)
  assert.throws(()=>validateGatewayConfig317(settings([{provider:'mantle',region:'us-east-1',auth:{}}])),/models list/)
  assert.throws(()=>validateGatewayConfig317(settings([{provider:'foundry',resource:'foo',auth:{}}])),/auth requires/)
  assert.throws(()=>validateGatewayConfig317(settings([{provider:'vertex',project_id:'p',auth:{}}])),/vertex.region/)
})
function providerFactory(observed){
  return async up=>({
    messages:{
      create(data,opts) {
        observed.push({kind:'messages',up,data,opts})
        const meta=new Response(null,{status:200,headers:{'request-id':'server-id'}})
        return {withResponse:async()=>({response:meta,
          data:data.stream?(async function*(){
            yield {type:'message_start',message:{model:'backend-model'}}
            yield {type:'message_stop'}
          })():{type:'message',model:'backend-model',content:[]}})}
      },
      countTokens(data,opts){
        observed.push({kind:'count_tokens',up,data,opts})
        return {withResponse:async()=>({data:{input_tokens:14},
          response:new Response(null,{status:200})})}
      },
    },
  })
}
test('317 gateway: SDK provider sends messages to model with proper SSE wire format',async()=>{
  const observed=[]
  const response=await forwardGatewaySdk317(candidates[1],{
    model:'backend-model',max_tokens:64,stream:true,messages:[]
  },'/v1/messages',{requestId:'request-1',requestedModel:'claude-opus-5',
    providerFactory:providerFactory(observed)})
  assert.equal(response.status,200)
  assert.match(response.headers.get('content-type'),/text\/event-stream/)
  const text=await response.text()
  assert.match(text,/event: message_start/)
  assert.match(text,/"model":"claude-opus-5"/)
  assert.match(text,/event: message_stop/)
  assert.equal(observed.length,1)
})
test('317 gateway: Bedrock count_tokens is rejected before calling any SDK',async()=>{
  let called=false
  const response=await forwardGatewaySdk317(candidates[1],{model:'claude'},'/v1/messages/count_tokens',{
    providerFactory:async()=>{called=true;throw Error('must not load')},
  })
  assert.equal(response.status,501)
  assert.equal(called,false)
})
test('317 gateway: other SDK providers return count_tokens JSON with unchanged semantics',async()=>{
  const observed=[]
  const response=await forwardGatewaySdk317(candidates[5],{model:'backend-model'},
    '/v1/messages/count_tokens',{providerFactory:providerFactory(observed)})
  assert.deepEqual(await response.json(),{input_tokens:14})
  assert.equal(observed[0].kind,'count_tokens')
})
test('317 gateway: client credentials are excluded from provider SDK args',async()=>{
  const observed=[]
  const base=validateGatewayConfig317(settings([candidates[5]]))
  const identity={sub:'alice',groups:['admin']}
  const response=await forwardGatewayInference317(new Request('https://gateway.example/v1/messages',{
    method:'POST',headers:{'content-type':'application/json',
      'authorization':'Bearer client-secret','x-api-key':'client-secret',
      'x-stainless-lang':'javascript'},
    body:JSON.stringify({model:'claude-opus-5',messages:[],max_tokens:64,stream:false}),
  }),{config:base,identity,
    audit:async()=>{},providerFactory:providerFactory(observed)})
  assert.equal(response.status,200)
  assert.equal((await response.json()).model,'claude-opus-5')
  assert.equal(observed[0].data.model,'backend-model')
  assert.deepEqual(observed[0].opts.headers,{'x-stainless-lang':'javascript'})
})
test('317 gateway: SDK exceptions do not leak operator credentials or details to the client',async()=>{
  const response=await forwardGatewaySdk317(candidates[5],{model:'claude'},
    '/v1/messages',{providerFactory:async()=>{throw new Error('secret-provider-key')}})
  assert.equal(response.status,502)
  assert.doesNotMatch(await response.text(),/secret-provider-key/)
})
