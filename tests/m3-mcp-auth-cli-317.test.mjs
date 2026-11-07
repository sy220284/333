import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const cli = resolve(import.meta.dirname, '../dist/cli.js')
test('MCP commands enforce transport/auth boundaries and durably clear one server', () => {
  const home = mkdtempSync(join(tmpdir(), '333-mcp-auth-cli-'))
  const env = { ...process.env, YAOYAOCHE_CONFIG_DIR: home, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', ENABLE_CLAUDEAI_MCP_SERVERS: 'false', DISABLE_TELEMETRY: '1' }
  const run = args => {
    const result = spawnSync('bun', [cli, 'mcp', ...args], { env, encoding: 'utf8', timeout: 25_000 })
    assert.ifError(result.error)
    return result
  }
  try {
    writeFileSync(join(home, '.yaoyaoche.json'), JSON.stringify({ mcpServers: {
      local: { command: 'echo', args: ['hello'] },
      hosted: { type: 'http', url: 'https://gmail.mcp.claude.com/mcp' },
      demo: { type: 'http', url: 'https://example.com/mcp' },
      static: { type: 'http', url: 'https://example.com/static', headers: { authorization: 'Bearer test' } },
    } }))
    const hash = createHash('sha256').update(JSON.stringify({ type: 'http', url: 'https://example.com/mcp', headers: {} })).digest('hex').slice(0, 16)
    const key = `demo|${hash}`
    writeFileSync(join(home, '.credentials.json'), JSON.stringify({ mcpOAuth: {
      [key]: { serverName: 'demo', serverUrl: 'https://example.com/mcp', accessToken: '', expiresAt: 0, stepUpScope: 'read' },
      other: { serverName: 'other', serverUrl: 'https://other.test', accessToken: 'keep-me', expiresAt: 0 },
    } }))
    writeFileSync(join(home, 'mcp-needs-auth-cache.json'), JSON.stringify({ demo: { timestamp: 1 }, other: { timestamp: 2 } }))
    const help = run(['login', '--help']); assert.equal(help.status, 0); assert.match(help.stdout, /--no-browser/)
    for (const [args, expected] of [
      [['login', 'missing'], /No MCP server found/],
      [['login', 'local'], /only available for HTTP and SSE/],
      [['logout', 'local'], /no stored credentials to clear/],
      [['login', 'hosted'], /Anthropic-hosted/],
      [['login', 'static'], /Authorization.*header/],
    ]) {
      const result = run(args); assert.equal(result.status, 1, result.stdout + result.stderr); assert.match(result.stderr, expected)
    }
    const logout = run(['logout', 'demo']); assert.equal(logout.status, 0, logout.stderr); assert.match(logout.stdout, /Signed out of "demo"/)
    // On macOS successful updates migrate .credentials.json into Keychain.
    // Inspect through the same secure-storage provider used by the CLI, so the
    // test proves the surviving OAuth credentials remain available on either
    // platform instead of depending on the obsolete plaintext file path.
    const inspect = spawnSync('bun', ['-e', `
      import { getSecureStorage } from './src/utils/secureStorage/index.ts'
      const stored = getSecureStorage().read()
      process.stdout.write(JSON.stringify({
        removed: stored?.mcpOAuth?.[process.env.MCP_TEST_DEMO_KEY] === undefined,
        retained: stored?.mcpOAuth?.other?.accessToken === 'keep-me',
      }))
    `], {
      cwd: resolve(import.meta.dirname, '..'),
      env: { ...env, MCP_TEST_DEMO_KEY: key },
      encoding: 'utf8',
      timeout: 25_000,
    })
    assert.ifError(inspect.error)
    assert.equal(inspect.status, 0, inspect.stderr)
    assert.deepEqual(JSON.parse(inspect.stdout), { removed: true, retained: true })
    const cache = JSON.parse(readFileSync(join(home, 'mcp-needs-auth-cache.json'), 'utf8'))
    assert.equal(cache.demo, undefined); assert.deepEqual(cache.other, { timestamp: 2 })
  } finally {
    // The isolated YAOYAOCHE_CONFIG_DIR also scopes the macOS Keychain name.
    // Delete the test keychain item so the test leaves no credentials behind.
    const cleanup = spawnSync('bun', ['-e', `
      import { getSecureStorage } from './src/utils/secureStorage/index.ts'
      if (!getSecureStorage().delete()) process.exitCode = 1
    `], {
      cwd: resolve(import.meta.dirname, '..'), env, encoding: 'utf8', timeout: 25_000,
    })
    rmSync(home, { recursive: true, force: true })
    assert.ifError(cleanup.error)
    assert.equal(cleanup.status, 0, cleanup.stderr)
  }
})
