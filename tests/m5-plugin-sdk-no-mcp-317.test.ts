import assert from 'node:assert/strict'
import test from 'node:test'
import { SdkPluginConfigSchema } from '../src/entrypoints/sdk/coreSchemas.js'
import type { LoadedPlugin } from '../src/types/plugin.js'
import { loadPluginMcpServers, getPluginMcpServers } from '../src/utils/plugins/mcpPluginIntegration.js'

test('SDK local plugin schema preserves the official skipMcpDiscovery field', () => {
  const plugin = SdkPluginConfigSchema().parse({
    type: 'local', path: '/example/plugin', skipMcpDiscovery: true,
  })
  assert.equal(plugin.skipMcpDiscovery, true)
})

test('SDK no-MCP plugin remains enabled but cannot expose discovered or cached MCP servers', async () => {
  const plugin = {
    name: 'no-mcp',
    path: '/unmounted-plugin',
    source: 'no-mcp@inline',
    repository: 'no-mcp@inline',
    manifest: { name: 'no-mcp', mcpServers: { tool: { type: 'stdio', command: 'tool' } } },
    enabled: true,
    skipMcpDiscovery: true,
    mcpServers: { cached: { type: 'stdio', command: 'cached' } },
  } as unknown as LoadedPlugin
  assert.equal(await loadPluginMcpServers(plugin), undefined)
  assert.equal(await getPluginMcpServers(plugin), undefined)
  assert.equal(plugin.enabled, true)
})
