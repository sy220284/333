/**
 * Gateway session JWT and OIDC code authorization.
 *
 * Sessions are HMAC-signed and pinned to the configured public origin.
 * Identity tokens are verified against the IdP's issuer and its published
 * signing keys. No unsigned/alg=none token is admitted.
 */
import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto'

const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url')
const decode = data => JSON.parse(Buffer.from(data, 'base64url').toString('utf8'))
const now = () => Math.floor(Date.now() / 1000)
const accepted = new Set(['RS256','RS384','PS256','ES256'])

export function signGatewaySession317(claims, secret, issuer, ttlHours = 12) {
  const issuedAt = now()
  const header = encode({ typ: 'JWT', alg: 'HS256' })
  const payload = encode({
    ...claims, iss: issuer, iat: issuedAt, exp: issuedAt + Math.floor(ttlHours * 3600),
  })
  const body = header + '.' + payload
  const signingSecret = Array.isArray(secret) ? secret[0] : secret
  const signature = createHmac('sha256', signingSecret).update(body).digest('base64url')
  return body + '.' + signature
}

export function verifyGatewaySession317(jwt, secret, issuer) {
  if (typeof jwt !== 'string') return null
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  let header, claims
  try {
    header = decode(parts[0]); claims = decode(parts[1])
  } catch { return null }
  if (header.alg !== 'HS256' || header.typ !== 'JWT') return null
  let actual
  try { actual = Buffer.from(parts[2], 'base64url') }
  catch { return null }
  if (actual.length !== 32) return null
  // The first secret signs newly minted sessions; all configured secrets can
  // verify old tokens during a controlled key rotation. Evaluate every key.
  const secrets = Array.isArray(secret) ? secret : [secret]
  let verified = 0
  for (const candidate of secrets) {
    const expected = createHmac('sha256', candidate)
      .update(parts[0] + '.' + parts[1]).digest()
    verified |= Number(timingSafeEqual(actual, expected))
  }
  if (!verified) return null
  if (claims.iss !== issuer || typeof claims.sub !== 'string' || !claims.sub ||
    typeof claims.exp !== 'number' || claims.exp <= now() ||
    typeof claims.iat !== 'number' || claims.iat > now() + 60) return null
  return claims
}

function validUrl(url, name) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))) {
    throw new Error(name + ' must use HTTPS')
  }
  return parsed
}
async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error('IdP endpoint returned HTTP ' + response.status)
  return response.json()
}

export async function createOidcProvider317(config) {
  const issuer = config.issuer.replace(/\/$/, '')
  const discovery = validUrl(issuer + '/.well-known/openid-configuration', 'OIDC discovery')
  const metadata = await getJson(discovery)
  if (metadata.issuer !== issuer) throw new Error('OIDC issuer mismatch')
  for (const key of ['authorization_endpoint','token_endpoint','jwks_uri']) {
    validUrl(metadata[key], 'OIDC ' + key)
  }
  if (!metadata.response_types_supported?.includes('code')) {
    throw new Error('OIDC provider must support code authorization')
  }
  let cachedKeys, expires = 0
  async function verifyIdToken(token, nonce) {
    const parts = String(token).split('.')
    if (parts.length !== 3) throw new Error('OIDC token has invalid shape')
    const header = decode(parts[0]), claims = decode(parts[1])
    if (!accepted.has(header.alg) || typeof header.kid !== 'string') {
      throw new Error('OIDC token algorithm or signing key is not supported')
    }
    if (expires <= Date.now()) {
      cachedKeys = await getJson(metadata.jwks_uri)
      expires = Date.now() + 300000
    }
    const jwk = cachedKeys?.keys?.find(x => x.kid === header.kid && (!x.alg || x.alg === header.alg))
    if (!jwk) throw new Error('OIDC token signing key not present in provider JWKS')
    const key = createPublicKey({ key: jwk, format: 'jwk' })
    const opts = header.alg === 'ES256'
      ? { key, dsaEncoding: 'ieee-p1363' }
      : header.alg === 'PS256'
        ? { key, padding: 6, saltLength: 32 }
        : key
    const algorithm = header.alg === 'RS384' ? 'sha384' : 'sha256'
    if (!verify(algorithm, Buffer.from(parts[0] + '.' + parts[1]), opts,
      Buffer.from(parts[2], 'base64url'))) {
      throw new Error('OIDC identity signature verification failed')
    }
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    if (claims.iss !== issuer || !audiences.includes(config.client_id) ||
      typeof claims.sub !== 'string' || !claims.sub ||
      typeof claims.exp !== 'number' || claims.exp <= now() ||
      typeof claims.iat !== 'number' || claims.iat > now() + 60 ||
      claims.nonce !== nonce) {
      throw new Error('OIDC identity claims failed verification')
    }
    if (audiences.length > 1 && claims.azp !== config.client_id) {
      throw new Error('OIDC authorized-party claim mismatch')
    }
    return claims
  }
  return {
    metadata,
    authorize({ redirectUri, state, challenge, nonce }) {
      const url = new URL(metadata.authorization_endpoint)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', config.client_id)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('scope', (config.scopes ?? ['openid','profile','email','offline_access']).join(' '))
      url.searchParams.set('state', state)
      url.searchParams.set('nonce', nonce)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('code_challenge', challenge)
      return url.toString()
    },
    async exchange(code, verifier, redirectUri, nonce) {
      const body = new URLSearchParams({
        grant_type: 'authorization_code', code, code_verifier: verifier,
        redirect_uri: redirectUri, client_id: config.client_id,
      })
      const headers = { 'content-type': 'application/x-www-form-urlencoded' }
      if (config.client_secret) {
        headers.authorization = 'Basic ' + Buffer.from(config.client_id + ':' + config.client_secret).toString('base64')
      }
      const response = await fetch(metadata.token_endpoint, {
        method: 'POST', body, headers, signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error('OIDC token exchange failed (' + response.status + ')')
      const tokens = await response.json()
      if (!tokens.id_token) throw new Error('OIDC IdP did not issue an id_token')
      return verifyIdToken(tokens.id_token, nonce)
    },
  }
}

export function createGatewayOidcLogin317(provider, config) {
  const states = new Map()
  function removeExpired() {
    const current = Date.now()
    for (const [token, entry] of states) if (entry.expires <= current) states.delete(token)
  }
  return {
    start() {
      removeExpired()
      const state = randomBytes(32).toString('base64url')
      const verifier = randomBytes(48).toString('base64url')
      const nonce = randomBytes(24).toString('base64url')
      const challenge = createHash('sha256').update(verifier).digest('base64url')
      states.set(state, { verifier, nonce, expires: Date.now() + 600000 })
      return provider.authorize({
        state, nonce, challenge,
        redirectUri: config.publicUrl + '/oauth/callback',
      })
    },
    async finish(state, code) {
      removeExpired()
      const entry = states.get(state)
      if (!entry) throw new Error('Invalid or expired OIDC authorization state')
      states.delete(state)
      return provider.exchange(code, entry.verifier, config.publicUrl + '/oauth/callback', entry.nonce)
    },
  }
}
