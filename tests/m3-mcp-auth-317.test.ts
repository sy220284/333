import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, mock, test } from 'bun:test'
import type { SecureStorageData } from '../src/utils/secureStorage/types.js'

let data: SecureStorageData = {}
let writable = true
mock.module('../src/utils/secureStorage/index.js', () => ({
  getSecureStorage: () => ({
    name: 'test',
    read: () => structuredClone(data),
    readAsync: async () => structuredClone(data),
    update: (next: SecureStorageData) => {
      if (!writable) return { success: false, warning: 'credential storage is read-only' }
      data = structuredClone(next)
      return { success: true }
    },
    delete: () => true,
  }),
}))
const { clearServerTokensFromLocalStorage, getServerKey, revokeServerTokens, performMCPOAuthFlow, ClaudeAuthProvider } = await import('../src/services/mcp/auth.js')
const { classifyMcpLogin } = await import('../src/cli/handlers/mcpAuth.js')
const config = { type: 'http' as const, url: 'https://example.com/mcp' }
const key = getServerKey('sample', config)

function seed() {
  data = { mcpOAuth: { [key]: { serverName: 'sample', serverUrl: config.url, accessToken: '', expiresAt: 0, stepUpScope: 'read write', discoveryState: { authorizationServerUrl: 'https://auth.example.com' } } } }
  writable = true
}

describe('MCP 317 login transport and credential semantics', () => {
  test('stdio and SDK servers cannot enter OAuth', () => {
    expect(classifyMcpLogin({ command: 'echo', args: [], scope: 'local' }).kind).toBe('unsupported-transport')
    expect(classifyMcpLogin({ type: 'sdk', name: 'sdk', scope: 'dynamic' }).kind).toBe('unsupported-transport')
  })
  test('hosted connectors use the cloud sign-in boundary, including normalized hosts', () => {
    expect(classifyMcpLogin({ ...config, url: 'https://GMAIL.mcp.claude.com./mcp', scope: 'user' }).kind).toBe('anthropic-hosted')
    expect(classifyMcpLogin({ ...config, url: 'https://gmail.mcp.claude.com.evil.test/mcp', scope: 'user' }).kind).toBe('oauth')
    expect(classifyMcpLogin({ type: 'claudeai-proxy', id: 'mcprs_1', url: config.url, scope: 'claudeai' }).kind).toBe('claudeai-proxy')
  })
  test('failed durable deletion throws and leaves stored credentials intact', () => {
    seed(); writable = false
    expect(() => clearServerTokensFromLocalStorage('sample', config)).toThrow('credential storage is read-only')
    expect(data.mcpOAuth?.[key]).toBeDefined()
  })
  test('logout clears saved scope and discovery state as well as tokens', async () => {
    seed()
    await revokeServerTokens('sample', config)
    expect(data.mcpOAuth?.[key]).toBeUndefined()
  })
  test('reauthentication preserves step-up state but removes tokens', async () => {
    seed()
    await revokeServerTokens('sample', config, { preserveStepUpState: true })
    expect(data.mcpOAuth?.[key]?.stepUpScope).toBe('read write')
    expect(data.mcpOAuth?.[key]?.discoveryState?.authorizationServerUrl).toBe('https://auth.example.com')
    expect(data.mcpOAuth?.[key]?.accessToken).toBe('')
  })
})


test('manual OAuth rejects foreign/stale callbacks, then completes token exchange', async () => {
  data = {}; writable = true
  let exchanged = false
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch(request) {
      const url = new URL(request.url)
      const origin = url.origin
      if (url.pathname.includes('oauth-authorization-server') || url.pathname.includes('openid-configuration')) return Response.json({
        issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`,
        response_types_supported: ['code'], code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      })
      if (url.pathname.includes('oauth-protected-resource')) return new Response('', { status: 404 })
      if (url.pathname === '/token') { exchanged = true; return Response.json({ access_token: 'test-access', token_type: 'Bearer', expires_in: 3600 }) }
      return new Response('', { status: 401 })
    },
  })
  let submit: ((url: string) => boolean) | undefined
  try {
    const url = `http://127.0.0.1:${server.port}/mcp`
    await performMCPOAuthFlow('roundtrip', { type: 'http', url, oauth: { clientId: 'test-client' } }, authorization => {
      const auth = new URL(authorization)
      const redirect = new URL(auth.searchParams.get('redirect_uri')!)
      redirect.searchParams.set('code', 'test-code')
      redirect.searchParams.set('state', auth.searchParams.get('state')!)
      expect(submit?.('garbage')).toBe(false)
      expect(submit?.(redirect.toString().replace('localhost', 'evil.test'))).toBe(false)
      const stale = new URL(redirect); stale.searchParams.set('state', 'stale-state')
      expect(submit?.(stale.toString())).toBe(false)
      expect(submit?.(redirect.toString())).toBe(true)
    }, undefined, { skipBrowserOpen: true, onWaitingForCallback: callback => { submit = callback } })
    expect(exchanged).toBe(true)
    expect(data.mcpOAuth?.[getServerKey('roundtrip', { type: 'http', url })]?.accessToken).toBe('test-access')
  } finally { server.stop(true) }
}, 15_000)

test('headless cancellation stops before opening a callback listener', async () => {
  data = {}; writable = true
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('', { status: 404 }) })
  const controller = new AbortController()
  try {
    await expect(performMCPOAuthFlow('cancel', { type: 'http', url: `http://127.0.0.1:${server.port}/mcp` }, () => {}, controller.signal, {
      skipBrowserOpen: true, onWaitingForCallback: () => controller.abort(),
    })).rejects.toThrow('Authentication was cancelled')
  } finally { server.stop(true) }
}, 15_000)


test('token and client registration persistence failures reject login', async () => {
  seed(); writable = false
  const provider = new ClaudeAuthProvider('sample', config)
  await expect(provider.saveTokens({ access_token: 'new-token', token_type: 'Bearer' })).rejects.toThrow('credential storage is read-only')
  await expect(provider.saveClientInformation({ client_id: 'new-client' })).rejects.toThrow('credential storage is read-only')
  expect(data.mcpOAuth?.[key]?.accessToken).toBe('')
})


test('negative-auth cache errors are reported and the write queue recovers', async () => {
  const { removeMcpAuthCacheEntry } = await import('../src/services/mcp/client.js')
  const home = mkdtempSync(join(tmpdir(), '333-auth-cache-'))
  const before = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = home
  const path = join(home, 'mcp-needs-auth-cache.json')
  try {
    mkdirSync(path)
    await expect(removeMcpAuthCacheEntry('demo')).rejects.toThrow()
    rmSync(path, { recursive: true })
    writeFileSync(path, JSON.stringify({ demo: { timestamp: 1 }, keep: { timestamp: 2 } }))
    await removeMcpAuthCacheEntry('demo')
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ keep: { timestamp: 2 } })
  } finally {
    if (before === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = before
    rmSync(home, { recursive: true, force: true })
  }
})
