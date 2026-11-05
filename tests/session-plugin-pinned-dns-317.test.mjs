import { test, expect } from 'bun:test'
import { createPinnedPluginLookup317, validateRemoteUrl } from '../src/utils/plugins/sessionPluginSources.ts'

const publicIp = [{ address: '8.8.8.8', family: 4 }, { address: '1.1.1.1', family: 4 }]

test('plugin HTTPS DNS lookup is bound to previously validated public addresses', () => {
  const lookup = createPinnedPluginLookup317('plugins.example.com', publicIp)
  lookup('plugins.example.com', { all: true }, (error, addresses) => {
    expect(error).toBeNull()
    expect(addresses).toEqual(publicIp)
  })
  lookup('plugins.example.com', { all: false }, (error, address, family) => {
    expect(error).toBeNull()
    expect(address).toBe('8.8.8.8')
    expect(family).toBe(4)
  })
})

test('plugin pinned DNS lookup rejects any hostname substitution', () => {
  const lookup = createPinnedPluginLookup317('plugins.example.com', publicIp)
  lookup('internal.example.com', { all: false }, error => {
    expect(String(error)).toContain('unexpected host')
  })
})

test('plugin pinned DNS lookup rejects local, private and mixed addresses', () => {
  expect(() => createPinnedPluginLookup317('plugins.example.com',
    [{ address: '127.0.0.1', family: 4 }])).toThrow('public host')
  expect(() => createPinnedPluginLookup317('plugins.example.com',
    [...publicIp, { address: '10.1.2.3', family: 4 }])).toThrow('public host')
  expect(() => createPinnedPluginLookup317('plugins.example.com',
    [{ address: '::1', family: 6 }])).toThrow('public host')
})

test('IPv6 link-local, site-local, multicast and IPv4-mapped destinations cannot be pinned', () => {
  for (const address of ['fe80::1', 'fe90::1', 'febf::1', 'fec0::1', 'ff02::1', '::ffff:7f00:1',
    '64:ff9b::a9fe:a9fe', '64:ff9b:1::a9fe:a9fe', '2002:7f00:1::', '2001:0::1',
    '100::1', '2001:db8::1']) {
    expect(() => createPinnedPluginLookup317('plugins.example.com',
      [{ address, family: 6 }])).toThrow('public host')
  }
})

test('public IPv6 URL is parsed as an IP literal without DNS; private literals are denied', async () => {
  const target = await validateRemoteUrl('https://[2606:4700:4700::1111]/plugin.zip')
  expect(target.hostname).toBe('2606:4700:4700::1111')
  expect(target.addresses).toEqual([{ address: '2606:4700:4700::1111', family: 6 }])
  await expect(validateRemoteUrl('https://[fe90::1]/plugin.zip')).rejects.toThrow('public host')
  await expect(validateRemoteUrl('https://[::ffff:127.0.0.1]/plugin.zip')).rejects.toThrow('public host')
})

test('benchmark/private IPv4 ranges are rejected even when not RFC1918', () => {
  for (const address of ['198.18.0.1', '198.19.255.254', '192.0.0.15']) {
    expect(() => createPinnedPluginLookup317('plugins.example.com',
      [{ address, family: 4 }])).toThrow('public host')
  }
})
