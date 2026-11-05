import { describe, expect, test } from 'bun:test'
import type { MCPServerConnection, ConnectedMCPServer } from '../src/services/mcp/types.js'
import {
  discoverMcpSkills,
  fetchMcpSkillsForClient,
  isSkillResource,
  readMcpSkillResource,
} from '../src/skills/mcpSkills.js'

function connected(
  listResources: (args?: { cursor?: string }) => Promise<unknown>,
  readResource: (args: { uri: string }) => Promise<unknown> = async () => ({ contents: [] }),
  name = 'demo.server',
): ConnectedMCPServer {
  return {
    type: 'connected',
    name,
    capabilities: { resources: {} },
    client: { listResources, readResource },
    config: { type: 'stdio', command: 'demo' },
    cleanup: async () => {},
  } as unknown as ConnectedMCPServer
}

describe('MCP skill resources: discover → invoke → refresh', () => {
  test('discovers every page, namespaces the commands, and defers resource reads', async () => {
    const requests: Array<string | undefined> = []
    let reads = 0
    const connection = connected(
      async params => {
        requests.push(params?.cursor)
        return params?.cursor
          ? { resources: [{ uri: 'skill://demo/review', name: 'review', description: 'Review files' }] }
          : {
              resources: [
                { uri: 'https://demo/not-a-skill', name: 'outside' },
                { uri: 'skill://demo/write', name: 'write', description: 'Write drafts' },
              ],
              nextCursor: 'page-two',
            }
      },
      async () => {
        reads++
        return { contents: [{ uri: 'skill://demo/write', text: 'Write carefully' }] }
      },
    )
    const commands = await discoverMcpSkills(connection)
    expect(requests).toEqual([undefined, 'page-two'])
    expect(commands.map(c => c.name)).toEqual([
      'mcp__demo_server__write',
      'mcp__demo_server__review',
    ])
    expect(commands.every(c => c.type === 'prompt' && c.source === 'mcp' && c.loadedFrom === 'mcp')).toBe(true)
    expect(reads).toBe(0)
    expect(await readMcpSkillResource(connection, 'skill://demo/write')).toEqual([
      { type: 'text', text: 'Write carefully' },
    ])
    expect(reads).toBe(1)
  })

  test('skips duplicate URIs and rejects name collisions from distinct skill resources', async () => {
    const duplicate = connected(async () => ({
      resources: [
        { uri: 'skill://demo/write', name: 'write' },
        { uri: 'skill://demo/write', name: 'write' },
      ],
    }))
    expect((await discoverMcpSkills(duplicate)).length).toBe(1)
    const collision = connected(async () => ({
      resources: [
        { uri: 'skill://demo/a', name: 'a b' },
        { uri: 'skill://demo/b', name: 'a_b' },
      ],
    }))
    await expect(discoverMcpSkills(collision)).rejects.toThrow('name collision')
  })

  test('detects repeated pagination cursors instead of cycling indefinitely', async () => {
    const connection = connected(async () => ({ resources: [], nextCursor: 'same' }))
    await expect(discoverMcpSkills(connection)).rejects.toThrow('repeated cursor')
  })

  test('does not perform resource RPC for servers lacking resource capability', async () => {
    const client = { type: 'connected', capabilities: {}, name: 'no.resources' } as MCPServerConnection
    expect(await discoverMcpSkills(client)).toEqual([])
    expect(isSkillResource({ uri: 'skill://demo/read', name: 'read' })).toBe(true)
    expect(isSkillResource({ uri: 'https://example.com', name: 'website' })).toBe(false)
    expect(isSkillResource({ uri: 'invalid url', name: 'invalid' })).toBe(false)
  })

  test('preserves text, text base64 and image blocks; rejects unsupported binary', async () => {
    const connection = connected(
      async () => ({ resources: [] }),
      async () => ({
        contents: [
          { uri: 'skill://demo/asset', text: 'Useful instructions' },
          { uri: 'skill://demo/asset', blob: Buffer.from('metadata').toString('base64'), mimeType: 'text/plain' },
          { uri: 'skill://demo/asset', blob: 'aGVsbG8=', mimeType: 'image/png' },
        ],
      }),
    )
    const blocks = await readMcpSkillResource(connection, 'skill://demo/asset')
    expect(blocks).toEqual([
      { type: 'text', text: 'Useful instructions' },
      { type: 'text', text: 'metadata' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } },
    ])

    const unsupported = connected(async () => ({ resources: [] }), async () => ({
      contents: [{ uri: 'skill://demo/asset', blob: 'abc', mimeType: 'application/octet-stream' }],
    }))
    await expect(readMcpSkillResource(unsupported, 'skill://demo/asset'))
      .rejects.toThrow('Unsupported MCP skill resource MIME type')
  })

  test('caches by server identity and invalidates on resource change', async () => {
    let fetches = 0
    const connection = connected(async () => {
      fetches++
      return { resources: [{ uri: 'skill://demo/write', name: 'write' }] }
    }, undefined, 'cache-test')
    fetchMcpSkillsForClient.cache.delete(connection.name)
    const [first, second] = await Promise.all([
      fetchMcpSkillsForClient(connection),
      fetchMcpSkillsForClient(connection),
    ])
    expect(first).toBe(second)
    expect(fetches).toBe(1)
    fetchMcpSkillsForClient.cache.delete(connection.name)
    await fetchMcpSkillsForClient(connection)
    expect(fetches).toBe(2)
    fetchMcpSkillsForClient.cache.delete(connection.name)
  })
})
