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

test('gateway 317: official JWT secret rotation keeps old sessions while signing with first secret', () => {
  const old = 'old-secret-'.repeat(5)
  const next = 'new-secret-'.repeat(5)
  const issuer = 'https://gateway.example.test'
  const legacy = signGatewaySession317({ sub:'employee' }, old, issuer, 1)
  const rotated = signGatewaySession317({ sub:'employee' }, [next, old], issuer, 1)
  expect(verifyGatewaySession317(legacy, [next, old], issuer)?.sub).toBe('employee')
  expect(verifyGatewaySession317(rotated, next, issuer)?.sub).toBe('employee')
  expect(verifyGatewaySession317(rotated, old, issuer)).toBeNull()
  expect(validateGatewayConfig317({
    ...configuration('https://api.anthropic.com'),
    session:{ jwt_secret:[next,old] },
  }).session.jwt_secret).toEqual([next,old])
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

test('gateway 317: managed settings served to authenticated clients with correct ETags', async () => {
  const config = configuration('https://api.anthropic.com')
  config.listen.port = 0
  config.managed = {
    policies: [
      { match: { groups:['engineering'] },
        cli: { permissions:{ deny:['Read(.env)'] },env:{ORG:'corp'} } },
    ],
  }
  const app = await createGatewayService317(config, { store, oidc: fakeOidc })
  try {
    const base = 'http://127.0.0.1:' + app.server.port
    const who = signGatewaySession317({
      sub:'alice', groups:['engineering'], email:'alice@example.test',
    }, secret,'http://127.0.0.1:0',1)
    const missing = await fetch(base + '/managed/settings')
    expect(missing.status).toBe(401)
    const current = await fetch(base + '/managed/settings',{
      headers:{authorization:'Bearer ' + who},
    })
    expect(current.status).toBe(200)
    expect(current.headers.get('cache-control')).toBe('no-store')
    const data = await current.json()
    expect(data.settings.env.ORG).toBe('corp')
    expect(data.settings.permissions.deny).toEqual(['Read(.env)'])
    const cached = await fetch(base + '/managed/settings',{
      headers:{authorization:'Bearer ' + who,
        'if-none-match':current.headers.get('etag')},
    })
    expect(cached.status).toBe(304)
    const outsider = signGatewaySession317({sub:'outsider',groups:[]},
      secret,'http://127.0.0.1:0',1)
    const denied = await fetch(base + '/managed/settings',{
      headers:{authorization:'Bearer ' + outsider},
    })
    expect(denied.status).toBe(404)
  } finally { await app.close() }
})

test('gateway 317: SSE idle deadline disabled and graceful shutdown awaits store closure once', async () => {
  const events = []
  let settings
  const config = configuration('https://api.anthropic.com')
  config.listen.port = 0
  const service = await createGatewayService317(config, {
    store: { ...store, async close() { events.push('store.close') } },
    oidc: fakeOidc,
    serve(options) {
      settings = options
      return {
        async stop(force) {
          events.push(`stop:${force}`)
          await Promise.resolve()
        },
      }
    },
  })
  expect(settings.idleTimeout).toBe(0)
  await Promise.all([service.close(), service.close()])
  expect(events).toEqual(['stop:false', 'store.close'])
})

test('gateway 317: explicit forced shutdown remains available', async () => {
  const events = []
  const config = configuration('https://api.anthropic.com')
  config.listen.port = 0
  const service = await createGatewayService317(config, {
    store: { ...store, async close() { events.push('store.close') } },
    oidc: fakeOidc,
    serve() {
      return { async stop(force) { events.push(`stop:${force}`) } }
    },
  })
  await service.close(true)
  expect(events).toEqual(['stop:true', 'store.close'])
})
