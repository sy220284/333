import { lock } from '../../utils/lockfile.js'
/**
 * Independent 333 Sign in with ChatGPT (open-source dynamic OAuth registration).
 * No Codex client impersonation; each installation registers a user-authorized
 * client with its stable agent host ID.
 */
import { createHash, createPublicKey, randomBytes, randomUUID, verify as verifySignature } from 'node:crypto'
import { createServer } from 'node:http'
import { promises as fs, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const AUTHORITY = 'https://auth.openai.com'
const TOKEN_ENDPOINT = `${AUTHORITY}/api/accounts/oauth/token`
const AUTHORIZE_ENDPOINT = `${AUTHORITY}/api/accounts/authorize`
const RESOURCE = 'https://api.openai.com/v1'
const SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
const DIR = join(homedir(), '.333', 'auth')
const FILE = join(DIR, 'chatgpt.json')
const HOST_FILE = join(DIR, 'host.json')
const ACCOUNT_FILE = join(DIR, 'chatgpt-registration.json')
type Credential = {
  client_id: string
  ext_agent_host_id: string
  subject: string
  /** Optional workspace identity from the verified ChatGPT ID token. */
  workspace_id?: string
  email?: string
  id_token: string
  access_token: string
  refresh_token: string
  scope: string
  expires_at: number
}
type Registration = { client_id: string; subject: string; email?: string }
type JWTPayload = { iss?: unknown; aud?: unknown; exp?: unknown; nbf?: unknown; sub?: unknown; nonce?: unknown; email?: unknown; 'https://api.openai.com/auth'?: unknown }
async function readJSON<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) as T }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
async function writePrivate(file: string, data: unknown): Promise<void> {
  await fs.mkdir(DIR, { recursive: true, mode: 0o700 })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' })
    await fs.rename(temporary, file)
    await fs.chmod(file, 0o600)
  } finally {
    await fs.rm(temporary, { force: true })
  }
}
async function getHostId(): Promise<string> {
  const existing = await readJSON<{ host_id: string }>(HOST_FILE)
  if (existing?.host_id?.startsWith('urn:uuid:')) return existing.host_id
  const id = `urn:uuid:${randomUUID()}`
  await writePrivate(HOST_FILE, { host_id: id })
  return id
}
async function validateIDToken(token: string, clientId: string, nonce: string): Promise<{ subject: string; email?: string; workspaceId?: string }> {
  const pieces = token.split('.')
  if (pieces.length !== 3) throw new Error('OIDC token is malformed')
  const [headerPart, bodyPart, signaturePart] = pieces as [string, string, string]
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as { kid?: string; alg?: string }
  const claims = JSON.parse(Buffer.from(bodyPart, 'base64url').toString('utf8')) as JWTPayload
  if (!['RS256', 'ES256'].includes(header.alg ?? '')) throw new Error('Unsupported OpenAI ID token signing algorithm')
  const discoveryResponse = await fetch(`${AUTHORITY}/.well-known/openid-configuration`)
  if (!discoveryResponse.ok) throw new Error('Failed to retrieve OpenAI OIDC discovery document')
  const discovery = await discoveryResponse.json() as { jwks_uri?: string; issuer?: string }
  if (discovery.issuer !== AUTHORITY || !discovery.jwks_uri) throw new Error('Unexpected OpenAI OIDC issuer')
  const jwksURL = new URL(discovery.jwks_uri)
  if (jwksURL.protocol !== 'https:' || jwksURL.hostname !== 'auth.openai.com') {
    throw new Error('OIDC JWKS endpoint must belong to OpenAI authorization authority')
  }
  const jwksResponse = await fetch(jwksURL)
  if (!jwksResponse.ok) throw new Error('Unable to fetch OpenAI identity signing keys')
  const jwks = await jwksResponse.json() as { keys?: Array<Record<string, unknown>> }
  const key = jwks.keys?.find(item => item.kid === header.kid && item.alg === header.alg)
  if (!key) throw new Error('OpenAI ID token signing key is unknown')
  const publicKey = createPublicKey({ key: key as JsonWebKey, format: 'jwk' })
  const isValid = verifySignature(header.alg === 'ES256' ? 'sha256' : 'RSA-SHA256',
    Buffer.from(`${headerPart}.${bodyPart}`),
    header.alg === 'ES256' ? { key: publicKey, dsaEncoding: 'ieee-p1363' } : publicKey,
    Buffer.from(signaturePart, 'base64url'))
  if (!isValid) throw new Error('OpenAI ID token signature verification failed')
  const now = Math.floor(Date.now() / 1000)
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (claims.iss !== AUTHORITY || !audience.includes(clientId) ||
      typeof claims.exp !== 'number' || claims.exp <= now ||
      (typeof claims.nbf === 'number' && claims.nbf > now) ||
      claims.nonce !== nonce || typeof claims.sub !== 'string') {
    throw new Error('OpenAI ID token claims did not pass validation')
  }
  // Codex distinguishes workspaces under the same ChatGPT user. Read this
  // namespace only after verifying the issuer, signature, audience and nonce.
  const accountClaim = claims['https://api.openai.com/auth']
  const auth = accountClaim && typeof accountClaim === 'object'
    ? accountClaim as { chatgpt_account_id?: unknown } : {}
  const workspace = auth.chatgpt_account_id
  return {
    subject: claims.sub,
    ...(typeof claims.email === 'string' ? { email: claims.email } : {}),
    ...(typeof workspace === 'string' && workspace.length > 0 && workspace.trim() === workspace
      ? { workspaceId: workspace } : {}),
  }
}
function scopeGranted(scopes: string): boolean {
  return scopes.split(/\s+/).includes('chatgpt.tokens.use.direct')
}
async function refreshCredentials(current: Credential): Promise<Credential> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token', client_id: current.client_id,
    refresh_token: current.refresh_token, resource: RESOURCE,
  })
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params,
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`ChatGPT refresh failed (HTTP ${response.status}). Sign in again.`)
  const data = await response.json() as Record<string, unknown>
  if (typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') {
    throw new Error('ChatGPT refresh response missing access or rotating refresh token')
  }
  const scopes = typeof data.scope === 'string' ? data.scope : current.scope
  if (!scopeGranted(scopes)) throw new Error('ChatGPT plan access permission was revoked')
  const updated: Credential = {
    ...current, access_token: data.access_token, refresh_token: data.refresh_token,
    scope: scopes, expires_at: Date.now() + Number(data.expires_in ?? 3600) * 1000,
  }
  await writePrivate(FILE, updated)
  return updated
}
async function withCredentialLock<T>(operation: () => Promise<T>): Promise<T> {
  await fs.mkdir(DIR, { recursive: true, mode: 0o700 })
  const unlock = await lock(FILE, { realpath: false, stale: 30_000,
    retries: { retries: 25, minTimeout: 100, maxTimeout: 1_000 } })
  try { return await operation() } finally { await unlock() }
}

type ChatGPTAuthorization = { token: string; account: string }
/** Legacy records keep the original identity until their workspace is known. */
export const getChatGPTAccountIdentity = (value: Pick<Credential, 'client_id' | 'subject' | 'workspace_id'>) =>
  JSON.stringify(value.workspace_id
    ? [value.client_id, value.subject, value.workspace_id]
    : [value.client_id, value.subject])
const accountIdentity = getChatGPTAccountIdentity

export async function getChatGPTAuthorization(
  rejected?: ChatGPTAuthorization,
): Promise<ChatGPTAuthorization> {
  const read = async () => {
    const credential = await readJSON<Credential>(FILE)
    if (!credential) throw new Error('ChatGPT not connected; run 333 auth chatgpt-login')
    if (!scopeGranted(credential.scope)) throw new Error('ChatGPT account lacks plan usage permission')
    if (rejected && accountIdentity(credential) !== rejected.account) {
      throw new Error('ChatGPT account changed while the request was pending')
    }
    return credential
  }
  const usable = (credential: Credential) =>
    credential.access_token !== rejected?.token && credential.expires_at > Date.now() + 120_000
  const credential = await read()
  if (usable(credential)) return { token: credential.access_token, account: accountIdentity(credential) }
  return withCredentialLock(async () => {
    const current = await read()
    if (current.subject !== credential.subject || current.client_id !== credential.client_id ||
        current.workspace_id !== credential.workspace_id) {
      throw new Error('ChatGPT account changed while the request was pending')
    }
    const selected = usable(current) ? current : await refreshCredentials(current)
    return { token: selected.access_token, account: accountIdentity(selected) }
  })
}
export async function getChatGPTAccessToken(): Promise<string> {
  return (await getChatGPTAuthorization()).token
}

function openBrowser(url: string): void {
  const platform = process.platform
  const command = platform === 'win32' ? 'rundll32.exe' : platform === 'darwin' ? 'open' : 'xdg-open'
  const args = platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url]
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  child.on('error', () => { /* printed URL remains available if no browser is installed */ })
  child.unref()
}
export async function loginWithChatGPT(): Promise<{ email?: string; subject: string; clientId: string }> {
  const hostId = await getHostId()
  const registration = await readJSON<Registration>(ACCOUNT_FILE)
  const existing = await readJSON<Credential>(FILE)
  const clientId = registration?.client_id ?? 'dynamic_agent_client'
  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const server = createServer()
  const callback = await new Promise<{ uri: string; query: Promise<URLSearchParams> }>((resolve, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') return reject(new Error('Could not open OAuth callback'))
      const uri = `http://127.0.0.1:${address.port}/auth/callback`
      const query = new Promise<URLSearchParams>((complete, fail) => {
        server.on('request', (request, response) => {
          const parsed = new URL(request.url ?? '/', uri)
          if (parsed.pathname !== '/auth/callback') {
            response.writeHead(404).end('Not found')
            return
          }
          if (parsed.searchParams.get('state') !== state) {
            response.writeHead(400).end('Invalid OAuth state')
            fail(new Error('ChatGPT OAuth state mismatch'))
            return
          }
          response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
          response.end('333 authorization received. You may return to the terminal.')
          complete(parsed.searchParams)
        })
      })
      resolve({ uri, query })
    })
  })
  let loginTimeout: NodeJS.Timeout | undefined
  try {
    const url = new URL(AUTHORIZE_ENDPOINT)
    for (const [key, value] of Object.entries({
      client_id: clientId, response_type: 'code', redirect_uri: callback.uri,
      scope: SCOPE, resource: RESOURCE, state, nonce,
      code_challenge_method: 'S256', code_challenge: challenge,
      ext_agent_host_id: hostId,
      ...(registration ? {} : { agent_name_hint: '333' }),
      ...(existing?.id_token && registration ? { id_token_hint: existing.id_token } : {}),
    })) url.searchParams.set(key, value)
    // A retained ID token is passed to the browser but never printed to logs.
    const displayURL = new URL(url)
    displayURL.searchParams.delete('id_token_hint')
    process.stdout.write(`Sign in with ChatGPT:\n${displayURL.toString()}\n`)
    openBrowser(url.toString())
    const args = await Promise.race([
      callback.query,
      new Promise<never>((_, reject) => {
        loginTimeout = setTimeout(() => reject(new Error('ChatGPT login timed out')), 180000)
      }),
    ])
    if (args.get('error')) throw new Error(`ChatGPT authorization declined: ${args.get('error')}`)
    const code = args.get('code')
    if (!code) throw new Error('ChatGPT callback missing authorization code')
    const returnedId = args.get('client_id')
    const issuedId = registration?.client_id ?? returnedId
    if (!issuedId || issuedId === 'dynamic_agent_client') throw new Error('Dynamic registration did not issue a client ID')
    if (registration && returnedId && returnedId !== registration.client_id) throw new Error('ChatGPT client registration changed unexpectedly')
    const params = new URLSearchParams({
      grant_type: 'authorization_code', client_id: issuedId, code, code_verifier: verifier,
      redirect_uri: callback.uri, resource: RESOURCE,
    })
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params,
    })
    if (!response.ok) throw new Error(`ChatGPT authorization exchange failed (HTTP ${response.status})`)
    const tokens = await response.json() as Record<string, unknown>
    if (typeof tokens.id_token !== 'string' || typeof tokens.access_token !== 'string' ||
        typeof tokens.refresh_token !== 'string' || typeof tokens.scope !== 'string') {
      throw new Error('ChatGPT token exchange returned incomplete credentials')
    }
    const identity = await validateIDToken(tokens.id_token, issuedId, nonce)
    if (registration && registration.subject !== identity.subject) {
      throw new Error('ChatGPT account identity changed during reauthorization')
    }
    if (!scopeGranted(tokens.scope)) throw new Error('ChatGPT login lacks the required usage scope')
    const credential: Credential = {
      client_id: issuedId, ext_agent_host_id: hostId, subject: identity.subject,
      ...(identity.workspaceId ? { workspace_id: identity.workspaceId } : {}),
      ...(identity.email ? { email: identity.email } : {}),
      id_token: tokens.id_token, access_token: tokens.access_token,
      refresh_token: tokens.refresh_token, scope: tokens.scope,
      expires_at: Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
    }
    await withCredentialLock(async () => {
      const current = await readJSON<Registration>(ACCOUNT_FILE)
      if (current?.client_id !== registration?.client_id || current?.subject !== registration?.subject) {
        throw new Error('ChatGPT account changed during login; restart the login flow')
      }
      await writePrivate(ACCOUNT_FILE, { client_id: issuedId, subject: identity.subject, email: identity.email })
      await writePrivate(FILE, credential)
    })
    return { subject: identity.subject, email: identity.email, clientId: issuedId }
  } finally {
    if (loginTimeout) clearTimeout(loginTimeout)
    server.close()
  }
}
/** For model selection during startup. No remote request or token exposure. */
export function getSavedChatGPTAccount(): string | undefined {
  let source: string
  try { source = readFileSync(FILE, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  const credential = JSON.parse(source) as Partial<Credential>
  if (typeof credential.refresh_token === 'string' && credential.refresh_token.length > 0 &&
    typeof credential.access_token === 'string' && credential.access_token.length > 0 &&
    typeof credential.scope === 'string' && scopeGranted(credential.scope) &&
      typeof credential.client_id === 'string' && typeof credential.subject === 'string') {
    return accountIdentity(credential as Credential)
  }
  return undefined
}
export function hasSavedChatGPTAuthorization(): boolean {
  return getSavedChatGPTAccount() !== undefined
}
export async function chatGPTStatus(): Promise<{ connected: boolean; email?: string; clientId?: string }> {
  const account = await readJSON<Credential>(FILE)
  return account
    ? { connected: scopeGranted(account.scope), email: account.email, clientId: account.client_id }
    : { connected: false }
}
/** Clear local identity and registration together so another account can sign in. */
export async function logoutChatGPT(): Promise<void> {
  const credential = await withCredentialLock(async () => {
    const saved = await readJSON<Credential>(FILE)
    await fs.rm(FILE, { force: true })
    await fs.rm(ACCOUNT_FILE, { force: true })
    return saved
  })
  let revocationError: Error | null = null
  if (credential) {
    try {
      const response = await fetch(`${AUTHORITY}/.well-known/openid-configuration`)
      if (!response.ok) throw new Error(`OIDC discovery HTTP ${response.status}`)
      const doc = await response.json() as { revocation_endpoint?: string }
      if (!doc.revocation_endpoint) throw new Error('OIDC provider does not advertise token revocation')
      const endpoint = new URL(doc.revocation_endpoint)
      if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'auth.openai.com') {
        throw new Error('Unexpected token revocation authority')
      }
      const revoke = await fetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: credential.client_id, token: credential.refresh_token,
          token_type_hint: 'refresh_token',
        }),
      })
      if (!revoke.ok) throw new Error(`Token revocation HTTP ${revoke.status}`)
    } catch (error) {
      revocationError = error instanceof Error ? error : new Error(String(error))
    }
  }
  if (revocationError) {
    throw new Error(`ChatGPT 本地账号与凭据已清除；远端撤销失败：${revocationError.message}`)
  }
}
