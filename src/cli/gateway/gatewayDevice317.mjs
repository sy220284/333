/**
 * OAuth 2.0 RFC 8628 device flow with OIDC-backed browser approval.
 * Tokens and device grants are PostgreSQL-backed; CLI never follows
 * cross-origin redirects for token endpoints.
 */
import { randomBytes } from 'node:crypto'
import { signGatewaySession317, createGatewayOidcLogin317 } from './gatewayAuth317.mjs'

const base20 = 'BCDFGHJKLMNPQRSTVWXZ'
const noStore = { 'cache-control': 'no-store', pragma: 'no-cache' }
const makeJson = (payload, status = 200) => Response.json(payload, { status, headers: noStore })
const errorJson = (code, status = 400, message) => makeJson({
  error: code, ...(message && { error_description: message }),
}, status)
const escape = data => String(data).replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
}[char]))
const randomCode = () => Array.from(randomBytes(8), b => base20[b % base20.length])
  .join('').replace(/^(.{4})/, '$1-')
const form = async request => {
  const text = await request.text()
  if (text.length > 16384) throw new Error('OAuth form exceeds 16 KiB')
  return new URLSearchParams(text)
}

export function createGatewayDeviceFlow317({ publicUrl, config, oidc, store }) {
  const idp = oidc
    ? createGatewayOidcLogin317(oidc, { publicUrl })
    : null
  const pending = new Map()
  const limit = async (kind, clientIp, configured) => {
    const count = await store.incrementRateLimit(kind, clientIp, configured.window_seconds)
    return count <= configured.max
  }
  // Same-origin browser form enforcement before an authorization state is created.
  const sameOrigin = request => {
    const fetchSite = request.headers.get('sec-fetch-site')
    if (fetchSite !== null) return fetchSite === 'same-origin' || fetchSite === 'none'
    return request.headers.get('origin') === publicUrl
  }
  const deviceBase = publicUrl + '/device'
  const publicDiscovery = () => makeJson({
    issuer: publicUrl,
    ...(idp ? {
      device_authorization_endpoint: publicUrl + '/oauth/device_authorization',
      token_endpoint: publicUrl + '/oauth/token',
      revocation_endpoint: publicUrl + '/oauth/revoke',
      grant_types_supported: [
        'urn:ietf:params:oauth:grant-type:device_code', 'refresh_token',
      ],
    } : { grant_types_supported: [] }),
    response_types_supported: [],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['openid','profile','email'],
    gateway_protocol_version: 1,
  })
  const createTokens = async claims => {
    const permitted = {
      sub: claims.sub,
      ...(claims.email && { email: claims.email }),
      ...(claims.name && { name: claims.name }),
      ...(claims.groups && { groups: claims.groups }),
    }
    const access = signGatewaySession317(
      permitted, config.session.jwt_secret, publicUrl, config.session.ttl_hours,
    )
    const refresh = randomBytes(48).toString('base64url')
    await store.createRefresh(refresh, permitted, 30 * 86400)
    return makeJson({
      access_token: access, refresh_token: refresh, token_type: 'Bearer',
      expires_in: Math.floor(config.session.ttl_hours * 3600),
    })
  }
  async function deviceAuthorization(request, clientIp) {
    if (!idp) return errorJson('unsupported_grant_type')
    if (!await limit('devauth', clientIp, config.rate_limits.device_authorization)) {
      await store.audit('device.authorize', null, null, {result:'rate_limited',client_ip:clientIp})
      return errorJson('slow_down', 429)
    }
    const input = await form(request)
    const deviceCode = randomBytes(48).toString('base64url')
    const userCode = randomCode()
    await store.newDevice(deviceCode, userCode.replaceAll('-', ''), 600)
    await store.audit('device.authorization', null, null, {
      surface: input.get('surface') ?? 'unknown',
    })
    return makeJson({
      device_code: deviceCode, user_code: userCode,
      verification_uri: deviceBase,
      verification_uri_complete: deviceBase + '?user_code=' + userCode,
      expires_in: 600, interval: 5,
    })
  }
  function verificationPage(request) {
    if (!idp) return new Response('OIDC login is not configured', { status: 404 })
    const url = new URL(request.url)
    const code = url.searchParams.get('user_code') ?? ''
    const html = `<!doctype html><html lang="en"><meta charset="utf-8">
    <title>Approve Claude Code sign-in</title>
    <h1>Approve a device</h1><p>Enter the code displayed by Claude Code.
    Only approve a code from a device you control.</p>
    <form action="/device" method="POST">
    <label>Device code <input name="user_code" required maxlength="16"
      value="${escape(code)}" autocomplete="off"></label>
    <button type="submit">Continue to company sign-in</button><button type="submit" formaction="/device/deny">Deny sign-in</button></form></html>`
    return new Response(html, { headers: {
      'content-type':'text/html; charset=utf-8', 'cache-control':'no-store',
      'content-security-policy':"default-src 'none'; form-action 'self'; style-src 'unsafe-inline'",
      'x-frame-options':'DENY',
    } })
  }
  async function verifyDevice(request, clientIp) {
    if (!sameOrigin(request)) {
      await store.audit('device.verify', null, null, {result:'csrf_rejected',client_ip:clientIp})
      return new Response('Device approval requires a same-origin browser form', {status:403})
    }
    if (!await limit('device', clientIp, config.rate_limits.device_verify)) {
      await store.audit('device.verify', null, null, {result:'rate_limited',client_ip:clientIp})
      return errorJson('slow_down',429)
    }
    const body = await form(request)
    const userCode = (body.get('user_code') ?? '').replace(/[^A-Za-z]/g, '').toUpperCase()
    if (userCode.length !== 8 || [...userCode].some(x => !base20.includes(x))) {
      return errorJson('invalid_request', 400, 'Invalid device code')
    }
    const url = idp.start()
    const state = new URL(url).searchParams.get('state')
    pending.set(state, { userCode, expires: Date.now() + 600000 })
    return Response.redirect(url, 303)
  }
  async function denyDevice(request,clientIp) {
    if (!sameOrigin(request)) return new Response('Invalid device approval origin',{status:403})
    if (!await limit('device',clientIp,config.rate_limits.device_verify)) return errorJson('slow_down',429)
    const body = await form(request)
    const code = (body.get('user_code') ?? '').replace(/[^A-Za-z]/g,'').toUpperCase()
    if (code.length !== 8) return errorJson('invalid_request',400,'Invalid device code')
    const denied = await store.denyCode(code)
    await store.audit('device.denied', null, null, {client_ip:clientIp, denied})
    return new Response(denied ? 'Device sign-in denied' : 'Device code expired or already used', {
      status:denied?200:400,headers:{'cache-control':'no-store'},
    })
  }
  async function callback(request) {
    const url = new URL(request.url)
    const state = url.searchParams.get('state')
    const code = url.searchParams.get('code')
    const item = pending.get(state)
    if (!state || !code || !item || item.expires <= Date.now()) {
      return new Response('Expired or invalid authorization state', { status: 400 })
    }
    pending.delete(state)
    const identity = await idp.finish(state, code)
    const groupsClaim = config.oidc?.groups_claim ?? 'groups'
    const rawGroups = identity[groupsClaim]
    const groups = Array.isArray(rawGroups) ? rawGroups.filter(x => typeof x === 'string')
      : typeof rawGroups === 'string' ? [rawGroups] : []
    const email = identity[config.oidc?.email_claim ?? 'email']
    const permittedDomains = config.oidc?.allowed_email_domains
    if (permittedDomains?.length && (!email || !permittedDomains.some(domain =>
      typeof domain === 'string' && email.toLowerCase().endsWith('@' + domain.toLowerCase())))) {
      return new Response('Email domain is not permitted', { status: 403 })
    }
    const allowedGroups = config.oidc?.allowed_groups
    if (allowedGroups?.length && !allowedGroups.some(group => groups.includes(group))) {
      return new Response('Group membership is not permitted', { status: 403 })
    }
    const claims = { sub: identity.sub, email, groups, name: identity.name }
    const success = await store.approveCode(item.userCode, claims)
    if (!success) return new Response('Device code expired or already used', { status: 400 })
    await store.audit('device.approved', identity.sub, null, {})
    return new Response('<!doctype html><html><meta charset="utf-8"><h1>Signed in</h1><p>You may return to Claude Code.</p></html>', {
      headers: {
        'content-type': 'text/html; charset=utf-8', 'cache-control':'no-store',
        'content-security-policy':"default-src 'none'", 'x-frame-options':'DENY',
      },
    })
  }
  async function token(request) {
    const input = await form(request)
    const grant = input.get('grant_type')
    if (grant === 'urn:ietf:params:oauth:grant-type:device_code') {
      const deviceCode = input.get('device_code')
      if (!deviceCode) return errorJson('invalid_request')
      const status = await store.consumeDevice(deviceCode)
      if (status.status === 'pending') return errorJson('authorization_pending')
      if (status.status === 'slow_down') return errorJson('slow_down', 429)
      if (status.status === 'expired') return errorJson('expired_token')
      return createTokens(status.claims)
    }
    if (grant === 'refresh_token') {
      const refresh = input.get('refresh_token')
      if (!refresh) return errorJson('invalid_request')
      const claims = await store.rotateRefresh(refresh)
      if (!claims) return errorJson('invalid_grant', 401)
      return createTokens(claims)
    }
    return errorJson('unsupported_grant_type')
  }
  async function revoke(request) {
    const data = await form(request)
    const token = data.get('token')
    if (token) await store.revoke(token)
    return new Response(null, { status: 200, headers: noStore })
  }
  return { publicDiscovery, deviceAuthorization, verificationPage,
    verifyDevice, denyDevice, callback, token, revoke }
}
