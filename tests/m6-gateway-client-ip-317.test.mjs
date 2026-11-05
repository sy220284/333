import { test, expect } from 'bun:test'
import { BlockList } from 'node:net'
import { resolveGatewayClientIp317 } from '../src/cli/gateway/gatewayClientIp317.mjs'

function trustedProxy(...addresses) {
  const list = new BlockList()
  for (const ip of addresses) list.addAddress(ip, ip.includes(':') ? 'ipv6' : 'ipv4')
  return list
}

test('gateway uses the rightmost untrusted XFF hop', () => {
  const trusted = trustedProxy('192.0.2.20')
  expect(resolveGatewayClientIp317('192.0.2.20', '203.0.113.99, 198.51.100.12', trusted))
    .toBe('198.51.100.12')
})

test('gateway walks through trusted proxy chain', () => {
  const trusted = trustedProxy('192.0.2.20', '192.0.2.30')
  expect(resolveGatewayClientIp317('192.0.2.20',
    '203.0.113.99, 198.51.100.12, 192.0.2.30', trusted))
    .toBe('198.51.100.12')
})

test('gateway ignores forwarding headers sent directly by untrusted clients', () => {
  expect(resolveGatewayClientIp317('198.51.100.12', '203.0.113.99', trustedProxy('192.0.2.20')))
    .toBe('198.51.100.12')
})

test('gateway refuses invalid forwarded addresses at trusted proxy boundaries', () => {
  const trusted = trustedProxy('192.0.2.20')
  expect(resolveGatewayClientIp317('192.0.2.20', '198.51.100.12, invalid', trusted)).toBeNull()
  expect(resolveGatewayClientIp317(null, '198.51.100.12', trusted)).toBeNull()
  expect(resolveGatewayClientIp317('192.0.2.20', '', trusted)).toBe('192.0.2.20')
})

test('gateway supports IPv6 peer and forwarded chain', () => {
  const trusted = trustedProxy('2001:db8::10')
  expect(resolveGatewayClientIp317('2001:db8::10',
    '2001:db8::bad, 2001:db8::20', trusted)).toBe('2001:db8::20')
})
