import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { buildStdioMcpEnvironment } from '../src/services/mcp/stdioEnvironment.mjs'

test('2.1.317: explicit empty Bedrock bearer token unsets inherited credentials for stdio MCP', () => {
  const env = buildStdioMcpEnvironment({
    AWS_BEARER_TOKEN_BEDROCK: 'inherited-secret', AWS_REGION: 'us-west-2',
  }, { AWS_BEARER_TOKEN_BEDROCK: '' })
  assert.equal('AWS_BEARER_TOKEN_BEDROCK' in env, false)
  assert.equal(env.AWS_REGION, 'us-west-2')
})

test('2.1.317: nonempty configured token still overrides inherited token', () => {
  assert.equal(buildStdioMcpEnvironment(
    { AWS_BEARER_TOKEN_BEDROCK: 'parent' },
    { AWS_BEARER_TOKEN_BEDROCK: 'configured' },
  ).AWS_BEARER_TOKEN_BEDROCK, 'configured')
})

test('2.1.317: leaving token unspecified preserves inherited token', () => {
  assert.equal(buildStdioMcpEnvironment(
    { AWS_BEARER_TOKEN_BEDROCK: 'parent' },
    { AWS_REGION: 'eu-west-1' },
  ).AWS_BEARER_TOKEN_BEDROCK, 'parent')
})

test('2.1.317: explicitly empty token without inherited token is omitted', () => {
  assert.deepEqual(buildStdioMcpEnvironment({ AWS_REGION: 'us-east-1' },
    { AWS_BEARER_TOKEN_BEDROCK: '' }), { AWS_REGION: 'us-east-1' })
})

test('production MCP client calls the centralized environment builder', () => {
  const src = readFileSync(new URL('../src/services/mcp/client.ts', import.meta.url), 'utf8')
  assert.match(src, /buildStdioMcpEnvironment\(/)
  assert.doesNotMatch(src, /env:\s*\{\s*\.\.\.subprocessEnv\(\),\s*\.\.\.serverRef\.env/)
})
