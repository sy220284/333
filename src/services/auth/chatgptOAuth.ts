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
import { dirname, join } from 'node:path'
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
const ACCOUNTS_FILE = join(DIR, 'chatgpt-accounts.json')
const TOKENS_DIR = join(DIR, 'chatgpt-tokens')
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
type Registration = { client_id: string; subject: string; email?: string; workspace_id?: string; credential?: Credential }
type AccountStore = { schema: 2; active: string | null; accounts: Registration[] }
/** A registration survives sign-out, and each account/workspace has an independent token record. */
function registrationIdentity(registration: Pick<Registration, 'client_id' | 'subject' | 'workspace_id'>): string {
  return JSON.stringify(registration.workspace_id
    ? [registration.client_id, registration.subject, registration.workspace_id]
    : [registration.client_id, registration.subject])
}
function validateAccountStore(value: AccountStore): AccountStore {
  if (value.schema !== 2 || !Array.isArray(value.accounts) ||
      (value.active !== null && typeof value.active !== 'string')) {
    throw new Error('Invalid ChatGPT account index')
  }
  const identities = new Set<string>()
  for (const entry of value.accounts) {
    if (typeof entry?.client_id !== 'string' || !entry.client_id ||
        typeof entry?.subject !== 'string' || !entry.subject) {
      throw new Error('Invalid saved ChatGPT registration')
    }
    const identity = registrationIdentity(entry)
    if (identities.has(identity)) throw new Error('Duplicate saved ChatGPT registration')
    identities.add(identity)
    if (entry.credential && (entry.credential.client_id !== entry.client_id ||
        entry.credential.subject !== entry.subject ||
        entry.credential.workspace_id !== entry.workspace_id)) {
      throw new Error('ChatGPT credential identity does not match its registration')
    }
  }
  if (value.active && !identities.has(value.active)) throw new Error('Selected ChatGPT account is missing')
  return value
}
function credentialFile(entry: Pick<Registration, 'client_id' | 'subject' | 'workspace_id'>): string {
  // The filename is derived only from stable registration identity, never a token.
  const key = createHash('sha256').update(registrationIdentity(entry)).digest('hex')
  return join(TOKENS_DIR, `${key}.json`)
}
async function readAccounts(): Promise<AccountStore> {
  const stored = await readJSON<AccountStore>(ACCOUNTS_FILE)
  if (stored) {
    validateAccountStore(stored)
    const accounts = await Promise.all(stored.accounts.map(async entry => {
      const credential = await readJSON<Credential>(credentialFile(entry))
      return { ...entry, ...(credential ? { credential } :
        entry.credential ? { credential: entry.credential } : {}) }
    }))
    return validateAccountStore({ ...stored, accounts })
  }
  // Import the original single-account credential without discarding it.
  const legacy = await readJSON<Credential>(FILE)
  const oldRegistration = await readJSON<Registration>(ACCOUNT_FILE)
  const entry = legacy ? { client_id: legacy.client_id, subject: legacy.subject,
    ...(legacy.email ? { email: legacy.email } : {}),
    ...(legacy.workspace_id ? { workspace_id: legacy.workspace_id } : {}),
    credential: legacy } : oldRegistration
  return entry ? { schema: 2, active: registrationIdentity(entry), accounts: [entry] }
    : { schema: 2, active: null, accounts: [] }
}
async function saveAccounts(value: AccountStore): Promise<void> {
  validateAccountStore(value)
  // Each issued client registration owns a separate 0600 token record.
  // Index metadata has no access/refresh/ID tokens; write tokens first and
  // the index last so a new active account never points at an absent record.
  for (const entry of value.accounts) {
    if (entry.credential) await writePrivate(credentialFile(entry), entry.credential)
    else await fs.rm(credentialFile(entry), { force: true })
  }
  await writePrivate(ACCOUNTS_FILE, {
    schema: 2, active: value.active,
    accounts: value.accounts.map(({ credential: _credential, ...entry }) => entry),
  })
  // The new atomic index takes precedence; discard duplicate legacy tokens.
  await fs.rm(FILE, { force: true })
  await fs.rm(ACCOUNT_FILE, { force: true })
}
function activeRegistration(value: AccountStore): Registration | undefined {
  return value.accounts.find(entry => registrationIdentity(entry) === value.active)
}
export type ChatGPTAccountSummary = {
  clientId: string; subject: string; email?: string; workspaceId?: string
  active: boolean; connected: boolean; planEnabled: boolean
}
export async function listChatGPTAccounts(): Promise<ChatGPTAccountSummary[]> {
  const store = await readAccounts()
  return store.accounts.map(entry => ({
    clientId: entry.client_id, subject: entry.subject, email: entry.email,
    ...(entry.workspace_id ? { workspaceId: entry.workspace_id } : {}),
    active: store.active === registrationIdentity(entry),
    connected: Boolean(entry.credential?.access_token && entry.credential?.refresh_token),
    planEnabled: Boolean(entry.credential && scopeGranted(entry.credential.scope)),
  }))
}
export async function selectChatGPTAccount(clientId: string): Promise<void> {
  await withCredentialLock(async () => {
    const store = await readAccounts()
    const registration = store.accounts.find(entry => entry.client_id === clientId)
    if (!registration) throw new Error('ChatGPT account registration not found')
    store.active = registrationIdentity(registration)
    await saveAccounts(store)
  })
}
type JWTPayload = { iss?: unknown; aud?: unknown; exp?: unknown; nbf?: unknown; sub?: unknown; nonce?: unknown; email?: unknown; 'https://api.openai.com/auth'?: unknown }
async function readJSON<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) as T }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
async function writePrivate(file: string, data: unknown): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true, mode: 0o700 })
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
  if (!response.ok) {
    const diagnostic = await response.json().catch(() => ({})) as { error?: string; code?: string }
    const code = typeof diagnostic.error === 'string' ? diagnostic.error : diagnostic.code
    const invalid = ['invalid_grant', 'invalid_refresh_token', 'token_expired',
      'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused'].includes(code ?? '')
    if (invalid) throw new Error(`ChatGPT refresh credential invalid (${code}); reauthorize the saved account`)
    throw new Error(`ChatGPT refresh HTTP ${response.status}${code ? ` (${code})` : ''}; credentials retained`)
  }
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
  return updated
}
async function withCredentialLock<T>(operation: () => Promise<T>): Promise<T> {
  await fs.mkdir(DIR, { recursive: true, mode: 0o700 })
  const unlock = await lock(FILE, { realpath: false, stale: 30_000,
    retries: { retries: 25, minTimeout: 100, maxTimeout: 1_000 } })
  try { return await operation() } finally { await unlock() }
}

type ChatGPTAuthorization = { token: string; account: string }
/** Shared request/refresh boundary for long-lived SDK clients. */
export function assertChatGPTAccountIdentity(
  boundAccount: string | undefined, current: Pick<ChatGPTAuthorization, 'account'>,
): void {
  if (!boundAccount || current.account !== boundAccount) {
    throw new Error('ChatGPT account changed; create a new model client before sending requests')
  }
}
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
    const entry = activeRegistration(await readAccounts())
    const credential = entry?.credential
    if (!credential) throw new Error('ChatGPT not connected; run 333 auth chatgpt-login')
    if (!scopeGranted(credential.scope)) {
      throw new Error('ChatGPT plan usage is disabled. Reauthorize or use an API key.')
    }
    if (rejected && accountIdentity(credential) !== rejected.account) {
      throw new Error('ChatGPT account changed while the request was pending')
    }
    return credential
  }
  const usable = (credential: Credential) =>
    credential.access_token !== rejected?.token && credential.expires_at > Date.now() + 120_000
  const original = await read()
  if (usable(original)) return { token: original.access_token, account: accountIdentity(original) }
  return withCredentialLock(async () => {
    const store = await readAccounts()
    const entry = activeRegistration(store)
    const current = entry?.credential
    if (!current || accountIdentity(current) !== accountIdentity(original)) {
      throw new Error('ChatGPT account changed while the request was pending')
    }
    if (usable(current)) return { token: current.access_token, account: accountIdentity(current) }
    const selected = await refreshCredentials(current)
    if (!entry) throw new Error('ChatGPT registration disappeared during refresh')
    entry.credential = selected
    await saveAccounts(store)
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
export async function loginWithChatGPT(
  options: { addAccount?: boolean; clientId?: string } = {},
  browser: (url: string) => void = openBrowser,
): Promise<{ email?: string; subject: string; clientId: string; planEnabled: boolean }> {
  if (options.addAccount && options.clientId) throw new Error('Select an existing account or register a new one')
  const hostId = await getHostId()
  const initialStore = await readAccounts()
  const registration = options.addAccount ? undefined
    : options.clientId ? initialStore.accounts.find(entry => entry.client_id === options.clientId)
    : activeRegistration(initialStore)
  if (options.clientId && !registration) throw new Error('Unknown ChatGPT client registration')
  const existing = registration?.credential
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
      ...(registration?.email ? { login_hint: registration.email } : {}),
    })) url.searchParams.set(key, value)
    // A retained ID token is passed to the browser but never printed to logs.
    const displayURL = new URL(url)
    displayURL.searchParams.delete('id_token_hint')
    process.stdout.write(`Sign in with ChatGPT:\n${displayURL.toString()}\n`)
    browser(url.toString())
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
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params, signal: AbortSignal.timeout(15_000),
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
    // Identity-only sign-in is valid. Keep it available for later explicit
    // consent or for choosing the user's independent OpenAI API key instead.
    const credential: Credential = {
      client_id: issuedId, ext_agent_host_id: hostId, subject: identity.subject,
      ...(identity.workspaceId ? { workspace_id: identity.workspaceId } : {}),
      ...(identity.email ? { email: identity.email } : {}),
      id_token: tokens.id_token, access_token: tokens.access_token,
      refresh_token: tokens.refresh_token, scope: tokens.scope,
      expires_at: Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
    }
    await withCredentialLock(async () => {
      const store = await readAccounts()
      const previous = registration ? store.accounts.find(entry =>
        registrationIdentity(entry) === registrationIdentity(registration)) : undefined
      if (registration && !previous) throw new Error('ChatGPT registration changed during login')
      if (previous && previous.workspace_id !== identity.workspaceId) {
        throw new Error('ChatGPT workspace changed during reauthorization')
      }
      const updated: Registration = {
        client_id: issuedId, subject: identity.subject,
        ...(identity.workspaceId ? { workspace_id: identity.workspaceId } : {}),
        ...(identity.email ? { email: identity.email } : {}),
        credential,
      }
      const registered = store.accounts.findIndex(entry =>
        registrationIdentity(entry) === registrationIdentity(updated))
      if (registered >= 0) store.accounts[registered] = updated
      else store.accounts.push(updated)
      // A pending new login remains separate from the currently selected
      // credentials until the ID token and grant have been verified.
      store.active = registrationIdentity(updated)
      await saveAccounts(store)
    })
    return { subject: identity.subject, email: identity.email,
      clientId: issuedId, planEnabled: scopeGranted(tokens.scope) }
  } finally {
    if (loginTimeout) clearTimeout(loginTimeout)
    server.close()
  }
}
/** For model selection during startup. No remote request or token exposure. */
export function getSavedChatGPTAccount(): string | undefined {
  const readSync = <T>(file: string): T | null => {
    try { return JSON.parse(readFileSync(file, 'utf8')) as T }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }
  const saved = readSync<AccountStore>(ACCOUNTS_FILE)
  if (saved) {
    validateAccountStore(saved)
    const active = activeRegistration(saved)
    if (!active) return undefined
    const credential = readSync<Credential>(credentialFile(active)) ?? active.credential
    if (credential && (credential.client_id !== active.client_id ||
      credential.subject !== active.subject || credential.workspace_id !== active.workspace_id)) {
      throw new Error('ChatGPT credential identity changed on disk')
    }
    return credential?.access_token && credential.refresh_token &&
      scopeGranted(credential.scope) ? accountIdentity(credential) : undefined
  }
  const legacy = readSync<Credential>(FILE)
  return legacy?.access_token && legacy.refresh_token && scopeGranted(legacy.scope)
    ? accountIdentity(legacy) : undefined
}
export function hasSavedChatGPTAuthorization(): boolean {
  return getSavedChatGPTAccount() !== undefined
}
export async function chatGPTStatus(): Promise<{
  connected: boolean; email?: string; clientId?: string; planEnabled: boolean
  accounts: ChatGPTAccountSummary[]
}> {
  const store = await readAccounts()
  const account = activeRegistration(store)
  const granted = Boolean(account?.credential && scopeGranted(account.credential.scope))
  return {
    connected: Boolean(account?.credential?.access_token),
    ...(account?.email ? { email: account.email } : {}),
    ...(account ? { clientId: account.client_id } : {}),
    planEnabled: granted,
    accounts: await listChatGPTAccounts(),
  }
}
/** Sign out of the active session while preserving the client registration and other accounts. */
export async function logoutChatGPT(): Promise<void> {
  let revocationError: Error | null = null
  await withCredentialLock(async () => {
    const store = await readAccounts()
    const entry = activeRegistration(store)
    const credential = entry?.credential
    if (!credential) return
    try {
      const response = await fetch(`${AUTHORITY}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(15_000),
      })
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
        }), signal: AbortSignal.timeout(15_000),
      })
      if (!revoke.ok) throw new Error(`Token revocation HTTP ${revoke.status}`)
    } catch (error) {
      revocationError = error instanceof Error ? error : new Error(String(error))
    } finally {
      if (entry) {
        delete entry.credential
        await saveAccounts(store)
      }
    }
  })
  if (revocationError) {
    throw new Error(`ChatGPT 本地凭据已清除，注册信息已保留；远端撤销未确认：${revocationError.message}`)
  }
}
