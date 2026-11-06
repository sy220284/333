import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('ChatGPT 官方动态注册、二账号隔离、授权范围、账号切换与撤销模拟', async () => {
  const root = mkdtempSync(join(tmpdir(), '333-siwc-'))
  const oldHome = process.env.HOME
  const oldProfile = process.env.USERPROFILE
  const oldFetch = globalThis.fetch
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-openai-kid', alg: 'RS256', use: 'sig' }
  let nonce = ''
  let registration = 0
  let currentScope = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
  let callbackError: Error | null = null
  const opened: URL[] = []
  const revocations: string[] = []
  const makeToken = (clientId: string, subject: string, workspace: string): string => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const raw = encode({ alg: 'RS256', kid: 'test-openai-kid' }) + '.' + encode({
      iss: 'https://auth.openai.com', aud: clientId,
      sub: subject, nonce, exp: Math.floor(Date.now() / 1000) + 3600,
      email: subject + '@example.test',
      'https://api.openai.com/auth': { chatgpt_account_id: workspace },
    })
    return raw + '.' + sign('RSA-SHA256', Buffer.from(raw), privateKey).toString('base64url')
  }
  try {
    process.env.HOME = root
    process.env.USERPROFILE = root
    const auth = await import('../src/services/auth/chatgptOAuth.ts')
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://auth.openai.com/.well-known/openid-configuration') {
        return Response.json({ issuer: 'https://auth.openai.com',
          jwks_uri: 'https://auth.openai.com/oauth/jwks',
          revocation_endpoint: 'https://auth.openai.com/oauth/revoke' })
      }
      if (url === 'https://auth.openai.com/oauth/jwks') {
        return Response.json({ keys: [jwk] })
      }
      if (url === 'https://auth.openai.com/api/accounts/oauth/token') {
        const grant = new URLSearchParams(String(init?.body)).get('grant_type')
        assert.equal(grant, 'authorization_code')
        const clientId = new URLSearchParams(String(init?.body)).get('client_id')
        assert.ok(clientId)
        const workspace = clientId === 'oaiapp_333_one' ? 'workspace-a' : 'workspace-b'
        const subject = clientId === 'oaiapp_333_one' ? 'user-a' : 'user-b'
        return Response.json({ id_token: makeToken(clientId, subject, workspace),
          access_token: 'access-' + clientId, refresh_token: 'refresh-' + clientId,
          expires_in: 3600, scope: currentScope })
      }
      if (url === 'https://auth.openai.com/oauth/revoke') {
        const token = new URLSearchParams(String(init?.body)).get('token')
        assert.ok(token)
        revocations.push(token)
        return new Response(null, { status: 200 })
      }
      throw new Error('Unexpected remote request: ' + url)
    }
    const browser = (address: string): void => {
      const url = new URL(address)
      opened.push(url)
      assert.equal(url.origin, 'https://auth.openai.com')
      assert.equal(url.pathname, '/api/accounts/authorize')
      nonce = url.searchParams.get('nonce') ?? ''
      assert.ok(nonce)
      const callback = new URL(url.searchParams.get('redirect_uri') ?? '')
      assert.equal(callback.hostname, '127.0.0.1')
      assert.equal(callback.pathname, '/auth/callback')
      callback.searchParams.set('state', url.searchParams.get('state') ?? '')
      callback.searchParams.set('code', 'test-authorization-code')
      if (url.searchParams.get('client_id') === 'dynamic_agent_client') {
        registration += 1
        callback.searchParams.set('client_id', registration === 1
          ? 'oaiapp_333_one' : 'oaiapp_333_two')
      }
      // The browser callback is real loopback HTTP; external identity endpoints
      // are mocked above. No actual tokens, user sessions or costs are used.
      void oldFetch(callback).catch(error => { callbackError = error as Error })
    }
    assert.deepEqual(await auth.listChatGPTAccounts(), [])
    const first = await auth.loginWithChatGPT({}, browser)
    assert.equal(first.clientId, 'oaiapp_333_one')
    assert.equal(first.planEnabled, true)
    const firstIdentity = auth.getSavedChatGPTAccount()
    assert.ok(firstIdentity)
    assert.equal((await auth.getChatGPTAuthorization()).token, 'access-oaiapp_333_one')
    currentScope = 'openid profile email'
    const second = await auth.loginWithChatGPT({ addAccount: true }, browser)
    assert.equal(second.clientId, 'oaiapp_333_two')
    assert.equal(second.planEnabled, false)
    assert.equal(auth.getSavedChatGPTAccount(), undefined)
    assert.equal((await auth.chatGPTStatus()).planEnabled, false)
    await assert.rejects(auth.getChatGPTAuthorization(), /plan usage is disabled/)
    const accounts = await auth.listChatGPTAccounts()
    assert.equal(accounts.length, 2)
    assert.ok(accounts.some(item => item.active && item.clientId === 'oaiapp_333_two'))
    assert.ok(accounts.some(item => item.clientId === 'oaiapp_333_one' && item.planEnabled))
    assert.equal(opened[0].searchParams.get('client_id'), 'dynamic_agent_client')
    assert.equal(opened[1].searchParams.get('client_id'), 'dynamic_agent_client')
    assert.equal(opened[0].searchParams.get('ext_agent_host_id'),
      opened[1].searchParams.get('ext_agent_host_id'))
    await auth.selectChatGPTAccount('oaiapp_333_one')
    assert.equal(auth.getSavedChatGPTAccount(), firstIdentity)
    assert.equal((await auth.getChatGPTAuthorization()).token, 'access-oaiapp_333_one')
    await auth.logoutChatGPT()
    assert.deepEqual(revocations, ['refresh-oaiapp_333_one'])
    assert.equal((await auth.chatGPTStatus()).connected, false)
    assert.equal((await auth.listChatGPTAccounts()).length, 2)
    assert.equal((await auth.listChatGPTAccounts())[0].clientId, 'oaiapp_333_one')
    currentScope = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
    await auth.loginWithChatGPT({ clientId: 'oaiapp_333_one' }, browser)
    assert.equal(opened[2].searchParams.get('client_id'), 'oaiapp_333_one')
    assert.equal(opened[2].searchParams.get('agent_name_hint'), null)
    assert.equal((await auth.getChatGPTAuthorization()).token, 'access-oaiapp_333_one')
    assert.equal((await auth.listChatGPTAccounts()).length, 2)
    assert.equal(callbackError, null)
    const saved = JSON.parse(readFileSync(join(root, '.333', 'auth', 'chatgpt-accounts.json'), 'utf8'))
    assert.equal(saved.schema, 2)
    assert.equal(saved.accounts.length, 2)
    // Index contains only account metadata; refresh and access tokens stay
    // isolated in per-account files with owner-only permissions.
    const indexText = readFileSync(join(root, '.333', 'auth', 'chatgpt-accounts.json'), 'utf8')
    assert.ok(!indexText.includes('access-oaiapp_333_one'))
    assert.ok(!indexText.includes('refresh-oaiapp_333_two'))
    const tokenDirectory = join(root, '.333', 'auth', 'chatgpt-tokens')
    const files = readdirSync(tokenDirectory)
    assert.equal(files.length, 2)
    const records = files.map(name => JSON.parse(readFileSync(join(tokenDirectory, name), 'utf8')))
    assert.deepEqual(records.map(x => x.client_id).sort(), ['oaiapp_333_one', 'oaiapp_333_two'])
    if (process.platform !== 'win32') {
      for (const name of files) {
        assert.equal(statSync(join(tokenDirectory, name)).mode & 0o777, 0o600)
      }
      assert.equal(statSync(join(root, '.333', 'auth', 'chatgpt-accounts.json')).mode & 0o777, 0o600)
    }
  } finally {
    globalThis.fetch = oldFetch
    if (oldHome === undefined) delete process.env.HOME
    else process.env.HOME = oldHome
    if (oldProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = oldProfile
    rmSync(root, { recursive: true, force: true })
  }
})
