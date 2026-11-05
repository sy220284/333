import { test, expect } from 'bun:test'
import { createPinnedPluginLookup317 } from '../src/utils/plugins/sessionPluginSources.ts'

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
