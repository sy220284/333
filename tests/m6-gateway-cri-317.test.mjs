import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateKeyPairSync, sign } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createCriAdmission317, isCriJwt317, validateCriConfig317,
  classifyCriCapability317, CRI_ISSUER_317 } from '../src/cli/gateway/gatewayCri317.mjs'
import { validateGatewayConfig317 } from '../src/cli/gateway/gatewayConfig317.mjs'
import { createGatewayService317 } from '../src/cli/gateway/gatewayServer317.mjs'
const org='11111111-2222-3333-4444-555555555555'
const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'})
const jwk={...publicKey.export({format:'jwk'}),kid:'key01',alg:'ES256',use:'sig'}
const now=Math.floor(Date.now()/1000)
const config=()=>validateCriConfig317({enabled:true,audience:['urn:gateway:employee'],org_allowlist:[org]})
function token(overrides={},key=privateKey,headerOverrides={}){
  const header={typ:'cri+jwt',alg:'ES256',kid:'key01',...headerOverrides}
  const claims={iss:CRI_ISSUER_317,aud:'urn:gateway:employee',org,
    sub:'ccr:session-01',scope:'inference',iat:now,exp:now+600,...overrides}
  const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
  const message=b64(header)+'.'+b64(claims)
  return message+'.'+sign('sha256',Buffer.from(message),
    {key,dsaEncoding:'ieee-p1363'}).toString('base64url')
}
const jwks=()=>Response.json({keys:[jwk]}, {headers:{'cache-control':'max-age=300'}})
test('CRI 317: signed ES256 JWT enforces issuer, audience, organization, scope and expiry',async()=>{
  const validator=createCriAdmission317(config(),{fetch:async()=>jwks()})
  assert.equal(await validator.prime(),true)
  assert.equal(isCriJwt317(token()),true)
  const ok=await validator.authenticate(token({act:{sub:'employee'}}))
  assert.equal(ok.ok,true)
  assert.equal(ok.claims.act.sub,'employee')
  for(const [name,bad] of [
    ['audience',token({aud:'another-gateway'})],
    ['org',token({org:'22222222-2222-3333-4444-555555555555'})],
    ['issuer',token({iss:'https://evil.example'})],
    ['scope',token({scope:'read'})],
    ['expired',token({exp:now-200})],
    ['future nbf',token({nbf:now+300})],
    ['bad algorithm',token({},privateKey,{alg:'HS256'})],
    ['bad typ',token({},privateKey,{typ:'JWT'})],
    ['bad signature',token().slice(0,-3)+'zzz'],
  ]){
    const result=await validator.authenticate(bad)
    assert.equal(result.status,401,name)
  }
})
test('CRI 317: stale JWKS fails closed and unpinned JWKS overrides are rejected',async()=>{
  let clock=Date.now(),available=true
  const admission=createCriAdmission317(config(),{
    now:()=>clock,fetch:async()=>{if(!available)throw Error('network down');return jwks()},
  })
  await admission.prime()
  available=false
  clock+=7*60*60*1000
  const denied=await admission.authenticate(token())
  assert.equal(denied.status,503)
  assert.equal(denied.reason,'jwks_unavailable')
  assert.throws(()=>validateCriConfig317({enabled:true,audience:['x'],org_allowlist:[org],
    jwks_url:'https://attacker.example/keys'}),/loopback tests only/)
  assert.throws(()=>validateCriConfig317({enabled:true,audience:[],org_allowlist:[org]}),/audience/)
})
test('CRI 317: capability tokens allow native model fallback',()=>{
  assert.equal(classifyCriCapability317(400,'output_config.format: Extra inputs are not permitted'),
    'capability_rejected: structured_outputs_unsupported')
  assert.equal(classifyCriCapability317(400,'Invalid signature in thinking block'),
    'capability_rejected: thinking_signature')
  assert.equal(classifyCriCapability317(400,'This model does not support the effort parameter'),
    'capability_rejected: effort_unsupported')
  assert.equal(classifyCriCapability317(400,'anthropic-beta: unknown beta feature-2026-01-01','feature-2026-01-01'),
    'capability_rejected: beta_header:feature-2026-01-01')
  assert.equal(classifyCriCapability317(503,'upstream failure'),null)
})
test('CRI 317: no-IdP admission, upstream isolation, error scrubbing and invalid token',async()=>{
  const previous=globalThis.Bun
  globalThis.Bun={serve(){throw Error('requires injection')}}
  const upstream=createServer((req,res)=>{
    assert.equal(req.headers.authorization,undefined)
    assert.equal(req.headers['x-api-key'],'server-key')
    assert.notEqual(req.headers['x-request-id'],'client-chosen')
    res.writeHead(400,{'content-type':'text/html','request-id':'upstream-id',
      'anthropic-organization-id':'secret-org','anthropic-ratelimit-requests-limit':'1'})
    res.end('<html>internal.hostname: output_config.format: Extra inputs are not permitted</html>')
  })
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening')
  let app
  const db={async audit(){},async close(){},
    async isRevoked(){throw Error('CRI must not use gateway session revocation')}}
  try{
    const configured=validateGatewayConfig317({
      listen:{host:'127.0.0.1',port:49174},
      store:{postgres_url:'postgres://localhost/gateway'},
      session:{jwt_secret:'s'.repeat(64)},
      upstreams:[{name:'api',provider:'anthropic',
        base_url:'http://127.0.0.1:'+upstream.address().port,
        auth:{api_key:'server-key'},models:['claude-sonnet-demo']}],
      cri:{enabled:true,audience:['urn:gateway:employee'],org_allowlist:[org]},
    })
    let handler
    const cri=createCriAdmission317(config(),{fetch:async()=>jwks()})
    app=await createGatewayService317(configured,{store:db,cri,
      serve(options){handler=options.fetch;return {async stop(){}}},
    })
    const send=(path,auth,method='POST')=>handler(new Request('http://127.0.0.1:49174'+path,{
      method,headers:{authorization:'Bearer '+auth,'x-request-id':'client-chosen',
        'content-type':'application/json'},
      ...(method==='POST'?{body:JSON.stringify({model:'claude-sonnet-demo',messages:[],max_tokens:5})}:{})
    }),{requestIP(){return {address:'127.0.0.1'}}})
    const discovery=await handler(new Request('http://127.0.0.1:49174/.well-known/oauth-authorization-server'),
      {requestIP(){return {address:'127.0.0.1'}}})
    assert.equal(discovery.status,200)
    assert.deepEqual((await discovery.json()).grant_types_supported,[])
    assert.equal((await send('/oauth/token',token())).status,404)
    assert.equal((await send('/v1/models',token(),'GET')).status,401)
    const result=await send('/v1/messages',token())
    assert.equal(result.status,400)
    assert.equal(result.headers.get('anthropic-organization-id'),null)
    assert.equal(result.headers.get('anthropic-ratelimit-requests-limit'),null)
    assert.notEqual(result.headers.get('x-request-id'),'upstream-id')
    const content=await result.text()
    assert.ok(content.includes('capability_rejected: structured_outputs_unsupported'))
    assert.ok(!content.includes('internal.hostname'))
    assert.equal((await send('/v1/messages',token({aud:'wrong'}))).status,401)
  }finally{
    if(app)await app.close()
    globalThis.Bun=previous
    await new Promise((ok,bad)=>upstream.close(error=>error?bad(error):ok()))
  }
})
