import { test, expect } from 'bun:test'
import { validateGatewayConfig317 } from '../src/cli/gateway/gatewayConfig317.mjs'
import { verifyGatewaySession317 } from '../src/cli/gateway/gatewayAuth317.mjs'
import { createGatewayService317 } from '../src/cli/gateway/gatewayServer317.mjs'

const secret = 'abcdefghijklmnopqrstuvwxyz0123456789SECRET'
function fakeStore() {
  const devices = new Map(), refreshTokens = new Map(), revoked = new Set()
  return {
    devices, refreshTokens, revoked, audits: [],
    async newDevice(deviceCode, userCode, expires) {
      devices.set(deviceCode, { userCode, expires, approved: null, consumed:false })
    },
    async approveCode(code, claims) {
      const entry = [...devices.values()].find(x => x.userCode === code)
      if (!entry) return false
      entry.approved = claims
      return true
    },
    async consumeDevice(deviceCode) {
      const entry = devices.get(deviceCode)
      if (!entry || entry.consumed) return {status:'expired'}
      if (!entry.approved) return {status:'pending'}
      entry.consumed = true
      return {status:'approved',claims:entry.approved}
    },
    async createRefresh(token, claims) { refreshTokens.set(token, claims) },
    async rotateRefresh(token) {
      const entry = refreshTokens.get(token)
      refreshTokens.delete(token)
      return entry ?? null
    },
    async revoke(token) { revoked.add(token); refreshTokens.delete(token) },
    async isRevoked(token) { return revoked.has(token) },
    async audit(...args) { this.audits.push(args) },
    async close() {},
  }
}
const fakeIdp = {
  authorize({state,nonce,challenge,redirectUri}) {
    expect(nonce.length).toBeGreaterThan(15)
    expect(challenge.length).toBeGreaterThan(30)
    expect(redirectUri.endsWith('/oauth/callback')).toBe(true)
    return 'https://idp.example.test/authorize?state=' + state
  },
  async exchange(code, verifier, redirectUri, nonce) {
    expect(code).toBe('real-idp-code')
    expect(verifier.length).toBeGreaterThan(30)
    return {
      sub:'employee-317', email:'employee@example.test',
      name:'Employee', groups:['engineering'],
    }
  },
}
function config() {
  const base = validateGatewayConfig317({
    listen:{host:'127.0.0.1',port:49170},
    store:{postgres_url:'postgres://localhost:5432/gateway'},
    session:{jwt_secret:secret,ttl_hours:1},
    oidc:{issuer:'https://idp.example.test',client_id:'app',
      allowed_email_domains:['example.test'], allowed_groups:['engineering']},
    upstreams:[{name:'sample',provider:'anthropic',auth:{api_key:'key'},
      models:['test-model']}],
    models:[{id:'test-model',upstream_model:{sample:'test-model'}}],
  })
  base.listen.port = 0
  return base
}

test('gateway 317 device authorization: discover, browser approval, token, refresh and revocation', async () => {
  const store = fakeStore()
  const app = await createGatewayService317(config(), {store,oidc:fakeIdp})
  try {
    const origin = 'http://127.0.0.1:' + app.server.port
    const discovery = await (await fetch(origin + '/.well-known/oauth-authorization-server')).json()
    expect(discovery.device_authorization_endpoint).toContain('/oauth/device_authorization')
    const started = await fetch(origin + '/oauth/device_authorization',{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({surface:'claude_code'}),
    })
    expect(started.status).toBe(200)
    const authorization = await started.json()
    expect(authorization.device_code.length).toBeGreaterThan(40)
    expect(authorization.user_code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/)
    const tokenForm = new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:device_code',
      device_code:authorization.device_code,
    })
    const pending = await fetch(origin + '/oauth/token',{method:'POST',body:tokenForm})
    expect((await pending.json()).error).toBe('authorization_pending')
    const page = await fetch(origin + '/device?user_code=' + authorization.user_code)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Approve a device')
    const redirect = await fetch(origin + '/device',{
      method:'POST',body:new URLSearchParams({user_code:authorization.user_code}),
      redirect:'manual',
    })
    expect(redirect.status).toBe(303)
    const state = new URL(redirect.headers.get('location')).searchParams.get('state')
    expect(state).toBeTruthy()
    const callback = await fetch(origin + '/oauth/callback?code=real-idp-code&state=' + state)
    expect(callback.status).toBe(200)
    const issued = await fetch(origin + '/oauth/token',{method:'POST',body:tokenForm})
    expect(issued.status).toBe(200)
    const credentials = await issued.json()
    expect(credentials.token_type).toBe('Bearer')
    const claims = verifyGatewaySession317(credentials.access_token,secret,'http://127.0.0.1:0')
    expect(claims.sub).toBe('employee-317')
    expect(claims.groups).toContain('engineering')
    const replay = await fetch(origin + '/oauth/token',{method:'POST',body:tokenForm})
    expect((await replay.json()).error).toBe('expired_token')
    const rotated = await fetch(origin + '/oauth/token',{
      method:'POST',body:new URLSearchParams({
        grant_type:'refresh_token',refresh_token:credentials.refresh_token,
      }),
    })
    expect(rotated.status).toBe(200)
    const renewed = await rotated.json()
    expect(renewed.refresh_token).not.toBe(credentials.refresh_token)
    const twice = await fetch(origin + '/oauth/token',{
      method:'POST',body:new URLSearchParams({
        grant_type:'refresh_token',refresh_token:credentials.refresh_token,
      }),
    })
    expect((await twice.json()).error).toBe('invalid_grant')
    const revoke = await fetch(origin + '/oauth/revoke',{
      method:'POST',body:new URLSearchParams({token:renewed.access_token}),
    })
    expect(revoke.status).toBe(200)
    const blocked = await fetch(origin + '/v1/models',{
      headers:{authorization:'Bearer ' + renewed.access_token},
    })
    expect(blocked.status).toBe(401)
    expect(store.audits.some(x => x[0] === 'device.approved')).toBe(true)
  } finally { await app.close() }
})
