import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('SIWC refresh separates invalid grants, temporary failures, revoked plan consent and rotation', async () => {
  const home = mkdtempSync(join(tmpdir(), '333-siwc-refresh-'))
  const previousHome = process.env.HOME
  const previousProfile = process.env.USERPROFILE
  const originalFetch = globalThis.fetch
  const dir = join(home, '.qerivon', 'auth')
  const tokenDir = join(dir, 'chatgpt-tokens')
  const client = 'oaiapp_refresh_fixture'
  const subject = 'verified-user'
  const identity = JSON.stringify([client, subject])
  const tokenPath = join(tokenDir, `${createHash('sha256').update(identity).digest('hex')}.json`)
  const indexPath = join(dir, 'chatgpt-accounts.json')
  const scope = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
  const fixture = (overrides: Record<string, unknown> = {}) => ({
    client_id: client, ext_agent_host_id: 'urn:uuid:00000000-0000-4000-8000-000000000001',
    subject, id_token: 'saved-id-token', access_token: 'old-access', refresh_token: 'old-refresh',
    scope, expires_at: Date.now() - 60_000, ...overrides,
  })
  const seed = (credential = fixture()) => {
    mkdirSync(tokenDir, { recursive: true, mode: 0o700 })
    writeFileSync(tokenPath, JSON.stringify(credential), { mode: 0o600 })
    writeFileSync(indexPath, JSON.stringify({
      schema: 2, active: identity, accounts: [{ client_id: client, subject }],
    }), { mode: 0o600 })
  }
  const stored = () => JSON.parse(readFileSync(tokenPath, 'utf8')) as Record<string, unknown>
  const index = () => JSON.parse(readFileSync(indexPath, 'utf8')) as {
    active: string; accounts: Array<{ client_id: string; subject: string }>
  }
  try {
    process.env.HOME = home
    process.env.USERPROFILE = home
    const auth = await import('../src/services/auth/chatgptOAuth.ts')

    seed()
    globalThis.fetch = async (_input, init) => {
      const params = new URLSearchParams(String(init?.body))
      assert.equal(params.get('grant_type'), 'refresh_token')
      assert.equal(params.get('client_id'), client)
      assert.equal(params.get('refresh_token'), 'old-refresh')
      assert.equal(params.get('resource'), 'https://api.openai.com/v1')
      assert.equal(params.has('scope'), false)
      return Response.json({ error: 'invalid_grant' }, { status: 400 })
    }
    await assert.rejects(auth.getChatGPTAuthorization(), /invalid_grant/)
    assert.equal(existsSync(tokenPath), false, 'permanent invalid_grant must clear unusable tokens')
    assert.equal(index().active, identity)
    assert.equal(index().accounts[0].client_id, client)
    assert.equal((await auth.listChatGPTAccounts())[0].connected, false)

    seed()
    globalThis.fetch = async () => Response.json({ error: 'temporarily_unavailable' }, { status: 503 })
    await assert.rejects(auth.getChatGPTAuthorization(), /HTTP 503/)
    assert.equal(stored().refresh_token, 'old-refresh', 'temporary failures must retain refresh credentials')
    assert.equal((await auth.listChatGPTAccounts())[0].connected, true)

    seed()
    globalThis.fetch = async () => Response.json({
      access_token: 'identity-only-access', refresh_token: 'rotated-without-plan',
      expires_in: 3600, scope: 'openid profile email offline_access',
    })
    await assert.rejects(auth.getChatGPTAuthorization(), /plan usage is disabled/)
    assert.equal(stored().refresh_token, 'rotated-without-plan',
      'replacement refresh token must survive a reduced scope grant')
    assert.equal((await auth.chatGPTStatus()).planEnabled, false)
    assert.equal((await auth.chatGPTStatus()).connected, true)

    seed()
    globalThis.fetch = async () => Response.json({
      access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600, scope,
    })
    const result = await auth.getChatGPTAuthorization()
    assert.equal(result.token, 'new-access')
    assert.equal(result.account, identity)
    assert.equal(stored().refresh_token, 'new-refresh')
    assert.equal(stored().access_token, 'new-access')
    assert.equal((await auth.chatGPTStatus()).planEnabled, true)
  } finally {
    globalThis.fetch = originalFetch
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousProfile === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = previousProfile
    rmSync(home, { recursive: true, force: true })
  }
})
