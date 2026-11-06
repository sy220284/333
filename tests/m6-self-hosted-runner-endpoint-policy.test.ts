import { expect, test } from 'bun:test'
import { resolveRunnerEndpoint } from '../src/cli/selfHostedRunner/endpointPolicy.ts'

test('Runner 需要明确的自托管服务地址', () => {
  expect(() => resolveRunnerEndpoint(undefined)).toThrow('明确指定')
  expect(() => resolveRunnerEndpoint('')).toThrow('明确指定')
  expect(resolveRunnerEndpoint('http://127.0.0.1:8123')).toBe('http://127.0.0.1:8123')
  expect(resolveRunnerEndpoint('http://localhost:8123/')).toBe('http://localhost:8123')
  expect(resolveRunnerEndpoint('https://runner.example.test')).toBe('https://runner.example.test')
})

test('Runner 拒绝官方云端与不安全的第三方 HTTP 地址', () => {
  for (const url of [
    'https://api.anthropic.com',
    'https://claude.ai',
    'https://sessions.claude.ai',
    'https://internal.ant.dev',
    'http://runner.example.test',
    'file:///etc/passwd',
    'https://runner.example.test/path',
    'https://runner.example.test?key=token',
    'https://user:password@runner.example.test',
  ]) expect(() => resolveRunnerEndpoint(url)).toThrow()
})
