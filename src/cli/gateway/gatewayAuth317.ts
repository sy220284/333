/**
 * Gateway session JWT and OIDC code authorization.
 *
 * Sessions are HMAC-signed and pinned to the configured public origin.
 * Identity tokens are verified against the IdP's issuer and its published
 * signing keys. No unsigned/alg=none token is admitted.
 */
import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto'

export type GatewaySessionClaims317 = Record<string, unknown> & {
  sub: string
  iss: string
  iat: number
  exp: number
  groups?: string[]
}
export type GatewayOidcConfig317 = {
  issuer: string
  client_id: string
  client_secret?: string
  scopes?: string[]
}
export type GatewayOidcClaims317 = Record<string, unknown> & {
  sub: string
  iss: string
  iat: number
  exp: number
}
export type GatewayOidcMetadata317 = Record<string, unknown> & {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
  response_types_supported: string[]
}
export type GatewayOidcProvider317 = {
  metadata: GatewayOidcMetadata317
  authorize: (params: {redirectUri: string; state: string; challenge: string; nonce: string}) => string
  exchange: (code: string, verifier: string, redirectUri: string, nonce: string) => Promise<GatewayOidcClaims317>
}
export type GatewayOidcLogin317 = {
  start: () => string
  finish: (state: string, code: string) => Promise<GatewayOidcClaims317>
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
const encode = (data: unknown): string => Buffer.from(JSON.stringify(data)).toString('base64url')
const decode = (data: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'))
  if (!isRecord(value)) throw new Error('Invalid JWT object')
  return value
}
const now = (): number => Math.floor(Date.now() / 1000)
const accepted = new Set(['RS256','RS384','PS256','ES256'])

export function signGatewaySession317(claims: Record<string, unknown>, secret: string | string[], issuer: string, ttlHours = 12): string {
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

export function verifyGatewaySession317(jwt: unknown, secret: string | string[], issuer: string): GatewaySessionClaims317 | null {
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
    typeof claims.iat !== 'number' || claims.iat > now() + 60 ||
    (claims.groups !== undefined && (!Array.isArray(claims.groups) ||
      !claims.groups.every((group: unknown) => typeof group === 'string')))) return null
  return claims as GatewaySessionClaims317
}

function validUrl(url: string, name: string): URL {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))) {
    throw new Error(name + ' must use HTTPS')
  }
  return parsed
}
async function getJson(url: string | URL, headers: HeadersInit = {}): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error('IdP endpoint returned HTTP ' + response.status)
  return response.json()
}

export async function createOidcProvider317(config: GatewayOidcConfig317): Promise<GatewayOidcProvider317> {
  const issuer = config.issuer.replace(/\/$/, '')
  const discovery = validUrl(issuer + '/.well-known/openid-configuration', 'OIDC discovery')
  const document = await getJson(discovery)
  if (!isRecord(document) || document.issuer !== issuer)
    throw new Error('OIDC issuer mismatch')
  for (const key of ['authorization_endpoint','token_endpoint','jwks_uri']) {
    const endpoint = document[key]
    if (typeof endpoint !== 'string') throw new Error('OIDC ' + key + ' must be a URL')
    validUrl(endpoint, 'OIDC ' + key)
  }
  if (!Array.isArray(document.response_types_supported) ||
      !document.response_types_supported.includes('code')) {
    throw new Error('OIDC provider must support code authorization')
  }
  const metadata = document as GatewayOidcMetadata317
  let cachedKeys: Array<Record<string, unknown>> | undefined
  let expires = 0
  async function verifyIdToken(token: string, nonce: string): Promise<GatewayOidcClaims317> {
    const parts = String(token).split('.')
    if (parts.length !== 3) throw new Error('OIDC token has invalid shape')
    const header = decode(parts[0]), claims = decode(parts[1])
    if (typeof header.alg !== 'string' || !accepted.has(header.alg) || typeof header.kid !== 'string') {
      throw new Error('OIDC token algorithm or signing key is not supported')
    }
    if (expires <= Date.now()) {
      const jwks = await getJson(metadata.jwks_uri)
      if (!isRecord(jwks) || !Array.isArray(jwks.keys))
        throw new Error('OIDC JWKS document is invalid')
      cachedKeys = jwks.keys.filter(isRecord)
      expires = Date.now() + 300000
    }
    const jwk = cachedKeys?.find(x => x.kid === header.kid && (!x.alg || x.alg === header.alg))
    if (!jwk) throw new Error('OIDC token signing key not present in provider JWKS')
    const key = createPublicKey({ key: jwk as import('node:crypto').JsonWebKeyInput['key'], format: 'jwk' })
    const opts = header.alg === 'ES256'
      ? { key, dsaEncoding: 'ieee-p1363' as const }
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
    return claims as GatewayOidcClaims317
  }
  return {
    metadata,
    authorize({ redirectUri, state, challenge, nonce }: {redirectUri: string; state: string; challenge: string; nonce: string}): string {
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
    async exchange(code: string, verifier: string, redirectUri: string, nonce: string): Promise<GatewayOidcClaims317> {
      const body = new URLSearchParams({
        grant_type: 'authorization_code', code, code_verifier: verifier,
        redirect_uri: redirectUri, client_id: config.client_id,
      })
      const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' }
      if (config.client_secret) {
        headers.authorization = 'Basic ' + Buffer.from(config.client_id + ':' + config.client_secret).toString('base64')
      }
      const response = await fetch(metadata.token_endpoint, {
        method: 'POST', body, headers, signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error('OIDC token exchange failed (' + response.status + ')')
      const tokens: unknown = await response.json()
      if (!isRecord(tokens) || typeof tokens.id_token !== 'string' || !tokens.id_token)
        throw new Error('OIDC IdP did not issue an id_token')
      return verifyIdToken(tokens.id_token, nonce)
    },
  }
}

export function createGatewayOidcLogin317(provider: GatewayOidcProvider317, config: { publicUrl: string }): GatewayOidcLogin317 {
  const states = new Map<string, {verifier: string; nonce: string; expires: number}>()
  function removeExpired(): void {
    const current = Date.now()
    for (const [token, entry] of states) if (entry.expires <= current) states.delete(token)
  }
  return {
    start(): string {
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
    async finish(state: string, code: string): Promise<GatewayOidcClaims317> {
      removeExpired()
      const entry = states.get(state)
      if (!entry) throw new Error('Invalid or expired OIDC authorization state')
      states.delete(state)
      return provider.exchange(code, entry.verifier, config.publicUrl + '/oauth/callback', entry.nonce)
    },
  }
}
