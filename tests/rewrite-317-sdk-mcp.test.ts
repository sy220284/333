import { describe, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { z } from 'zod/v4'
import { tool, createSdkMcpServer } from '../src/entrypoints/agentSdkTypes.js'

describe('2.1.317 SDK in-process MCP registration on 333 runtime', () => {
  test('factory preserves Zod schema, handler and tool metadata', () => {
    const handler = async ({ value }: { value: string }) => ({
      content: [{ type: 'text' as const, text: value }],
    })
    const definition = tool(
      'echo',
      'Echo one value',
      { value: z.string() },
      handler,
      { alwaysLoad: true, searchHint: 'echo text', annotations: { readOnlyHint: true } },
    )
    expect(definition.name).toBe('echo')
    expect(definition.handler).toBe(handler)
    expect(definition.inputSchema.value.safeParse('ok').success).toBe(true)
    expect(definition.alwaysLoad).toBe(true)
    expect(definition.annotations?.readOnlyHint).toBe(true)
  })

  test('in-process server advertises and executes custom tools through the real MCP protocol', async () => {
    const sdk = createSdkMcpServer({
      name: '333-sdk-test',
      version: '1.2.3',
      tools: [tool(
        'combine',
        'Join two strings',
        { left: z.string(), right: z.string() },
        async ({ left, right }) => ({
          content: [{ type: 'text', text: left + right }],
        }),
      )],
    })
    expect(sdk.type).toBe('sdk')
    expect(sdk.name).toBe('333-sdk-test')
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: '333-test-client', version: '1.0.0' })
    try {
      await sdk.instance.connect(serverSide)
      await client.connect(clientSide)
      const listed = await client.listTools()
      expect(listed.tools.map(t => t.name)).toContain('combine')
      const result = await client.callTool({
        name: 'combine',
        arguments: { left: 'new', right: 'sdk' },
      })
      expect(result.content).toEqual([{ type: 'text', text: 'newsdk' }])
    } finally {
      await client.close()
      await sdk.instance.close()
    }
  })

  test('Zod input validation rejects invalid arguments before invoking handler', async () => {
    let invocations = 0
    const sdk = createSdkMcpServer({
      name: '333-validated',
      tools: [tool('limited', 'Only numbers', { count: z.number() }, async ({ count }) => {
        invocations++
        return { content: [{ type: 'text', text: String(count) }] }
      })],
    })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: '333-client', version: '1.0.0' })
    try {
      await sdk.instance.connect(serverSide)
      await client.connect(clientSide)
      const bad = await client.callTool({ name: 'limited', arguments: { count: 'invalid' } })
      expect(bad.isError).toBe(true)
      expect(invocations).toBe(0)
    } finally {
      await client.close()
      await sdk.instance.close()
    }
  })
})
