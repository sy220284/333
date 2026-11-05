import { test, expect } from 'bun:test'
import { Client } from '@modelcontextprotocol/client'
import { Server } from '@modelcontextprotocol/server'
import { createLinkedTransportPair } from '../src/services/mcp/InProcessTransport.ts'
import {
  fetchToolsForClient,
  fetchResourcesForClient,
  fetchCommandsForClient,
} from '../src/services/mcp/client.ts'
import type { ConnectedMCPServer } from '../src/services/mcp/types.ts'

test('MCP v2 native discovery collects every tool, resource and prompt page', async () => {
  const requests = { tools: 0, resources: 0, prompts: 0 }
  const server = new Server(
    { name: 'pagination-fixture', version: '2.4.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  )
  const tool = (name: string) => ({
    name,
    inputSchema: { type: 'object' as const, properties: {} },
  })
  server.setRequestHandler('tools/list', ({ params }) => {
    requests.tools++
    return params?.cursor === 'next-tools'
      ? { tools: [tool('second-tool')] }
      : { tools: [tool('first-tool')], nextCursor: 'next-tools' }
  })
  server.setRequestHandler('resources/list', ({ params }) => {
    requests.resources++
    return params?.cursor === 'next-resources'
      ? { resources: [{ name: 'second', uri: 'test://second' }] }
      : { resources: [{ name: 'first', uri: 'test://first' }], nextCursor: 'next-resources' }
  })
  server.setRequestHandler('prompts/list', ({ params }) => {
    requests.prompts++
    return params?.cursor === 'next-prompts'
      ? { prompts: [{ name: 'second-prompt' }] }
      : { prompts: [{ name: 'first-prompt' }], nextCursor: 'next-prompts' }
  })
  const [clientTransport, serverTransport] = createLinkedTransportPair()
  const client = new Client({ name: 'pagination-check', version: '2.4.0' })
  const connection = {
    type: 'connected',
    name: 'pagination-fixture',
    capabilities: { tools: {}, resources: {}, prompts: {} },
    client,
    config: { type: 'stdio', command: 'fixture' },
    cleanup: async () => {},
  } as unknown as ConnectedMCPServer
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    fetchToolsForClient.cache.delete(connection.name)
    fetchResourcesForClient.cache.delete(connection.name)
    fetchCommandsForClient.cache.delete(connection.name)
    const [tools, resources, prompts] = await Promise.all([
      fetchToolsForClient(connection),
      fetchResourcesForClient(connection),
      fetchCommandsForClient(connection),
    ])
    expect(tools.map(tool => tool.mcpInfo?.toolName)).toEqual(['first-tool', 'second-tool'])
    expect(resources.map(resource => resource.uri)).toEqual(['test://first', 'test://second'])
    expect(prompts.map(prompt => prompt.name)).toEqual([
      'mcp__pagination-fixture__first-prompt',
      'mcp__pagination-fixture__second-prompt',
    ].map(name => name.replace('pagination-fixture', 'pagination_fixture')))
    expect(requests).toEqual({ tools: 2, resources: 2, prompts: 2 })
  } finally {
    fetchToolsForClient.cache.delete(connection.name)
    fetchResourcesForClient.cache.delete(connection.name)
    fetchCommandsForClient.cache.delete(connection.name)
    await client.close()
    await server.close()
  }
})
