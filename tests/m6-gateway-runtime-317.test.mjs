import { test, expect } from 'bun:test'
import { validateGatewayConfig317 } from '../src/cli/gateway/gatewayConfig317.mjs'
import { signGatewaySession317, verifyGatewaySession317 } from '../src/cli/gateway/gatewayAuth317.mjs'
import { createGatewayService317 } from '../src/cli/gateway/gatewayServer317.mjs'

const secret = '0123456789abcdef'.repeat(4)
const fakeOidc = {
  authorize: ({ state }) => 'https://idp.example.test/login?state=' + state,
  exchange: async () => ({ sub: 'user', email:'user@example.test' }),
}
const store = {
  auditCalls: [],
  isRevoked: async () => false,
  async audit(...args) { this.auditCalls.push(args) },
  async close() {},
  async newDevice() {},
}
function configuration(upstreamUrl) {
  return validateGatewayConfig317({
    listen: { host: '127.0.0.1', port: 49174 },
    store: { postgres_url: 'postgres://localhost:5432/gateway' },
    session: { jwt_secret: secret, ttl_hours: 1 },
    oidc: { issuer:'https://idp.example.test', client_id:'gateway-client' },
    upstreams: [{ name:'local', provider:'anthropic',
      base_url:upstreamUrl, auth:{api_key:'server-api-key'},
      models:['claude-opus-test'] }],
    models:[{ id:'claude-opus-test', upstream_model:{ local:'claude-opus-test' } }],
  })
}

test('gateway 317: config validates secret, DB, IdP and untrusted public exposure', () => {
  const base = configuration('https://api.anthropic.com')
  expect(base.listen.port).toBe(49174)
  expect(() => validateGatewayConfig317({
    ...base, listen:{ host:'0.0.0.0', port:8080, public_url: undefined },
  })).toThrow('listen.public_url')
  expect(() => validateGatewayConfig317({
    ...base, session:{ jwt_secret:'short' },
  })).toThrow('jwt_secret')
  expect(() => validateGatewayConfig317({
    ...base, store:{ postgres_url:'file:/tmp/gateway.sqlite' },
  })).toThrow()
  expect(() => validateGatewayConfig317({
    ...base, upstreams: [{ name:'local', provider:'anthropic',
      base_url:'http://untrusted.example.test', auth:{api_key:'key'} }],
  })).toThrow('requires https')
})

test('gateway 317: session signature, expiry and origin are checked', () => {
  const signed = signGatewaySession317({ sub:'alice',groups:['engineering'] },
    secret,'https://gw.example.test',1)
  expect(verifyGatewaySession317(signed,secret,'https://gw.example.test')?.sub).toBe('alice')
  expect(verifyGatewaySession317(signed + 'X',secret,'https://gw.example.test')).toBeNull()
  expect(verifyGatewaySession317(signed,secret,'https://another.example.test')).toBeNull()
})

test('gateway 317: unauthenticated traffic denied; signed model streaming uses server credential', async () => {
  const requests = []
  const upstream = Bun.serve({
    hostname:'127.0.0.1', port:0,
    async fetch(request) {
      requests.push({
        key:request.headers.get('x-api-key'),
        auth:request.headers.get('authorization'),
        model:(await request.json()).model,
      })
      return new Response('data: {"type":"message_stop"}\n\n', {
        headers:{'content-type':'text/event-stream'},
      })
    },
  })
  const config = configuration('http://127.0.0.1:' + upstream.port)
  config.listen.port = 0
  const app = await createGatewayService317(config, { store, oidc: fakeOidc })
  try {
    const url = 'http://127.0.0.1:' + app.server.port
    const deny = await fetch(url + '/v1/models')
    expect(deny.status).toBe(401)
    const health = await fetch(url + '/healthz')
    expect(health.status).toBe(200)
    const access = signGatewaySession317(
      { sub:'alice',groups:['engineering'] }, secret,'http://127.0.0.1:0',1)
    const models = await fetch(url + '/v1/models', {
      headers:{ authorization:'Bearer ' + access },
    })
    expect(models.status).toBe(200)
    const modelData = await models.json()
    expect(modelData.data.map(m => m.id)).toContain('claude-opus-test')
    const result = await fetch(url + '/v1/messages',{
      method:'POST',headers:{
        authorization:'Bearer ' + access, 'content-type':'application/json',
        'anthropic-version':'2023-06-01','x-api-key':'client-secret',
      },
      body:JSON.stringify({model:'claude-opus-test',messages:[],max_tokens:20,stream:true}),
    })
    expect(result.status).toBe(200)
    expect(result.headers.get('content-type')).toContain('text/event-stream')
    expect(await result.text()).toContain('message_stop')
    expect(requests).toHaveLength(1)
    expect(requests[0].key).toBe('server-api-key')
    expect(requests[0].auth).toBeNull()
    expect(requests[0].model).toBe('claude-opus-test')
  } finally {
    await app.close()
    await upstream.stop(true)
  }
})
