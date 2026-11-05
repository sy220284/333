import { test, expect } from 'bun:test'
import { z } from 'zod/v4'
import { Client } from '@modelcontextprotocol/client'
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createLinkedTransportPair } from '../src/services/mcp/InProcessTransport.ts'

async function runClient(mode: 'legacy' | 'auto') {
  const [clientTransport, serverTransport] = createLinkedTransportPair()
  const observed: string[] = []
  const handler = serveStdio(({ era }) => {
    observed.push(era)
    const server = new McpServer({ name: '333-dual-era-server', version: '2.1.317' })
    server.registerTool('echo', {
      description: 'Echos a string',
      inputSchema: z.object({ text: z.string().min(1) }),
      outputSchema: z.object({ result: z.string() }),
    }, async ({ text }) => ({
      content: [{ type: 'text', text }],
      structuredContent: { result: text },
    }))
    return server
  }, { transport: serverTransport, legacy: 'serve' })
  const client = new Client(
    { name: '333-dual-era-test', version: '1.0.0' },
    mode === 'auto' ? { versionNegotiation: { mode: 'auto' } } : {},
  )
  try {
    await client.connect(clientTransport)
    const listed = await client.listTools()
    expect(listed.tools.map(tool => tool.name)).toContain('echo')
    const result = await client.callTool({ name: 'echo', arguments: { text: '中文 Unicode ✓' } })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContainEqual({ type: 'text', text: '中文 Unicode ✓' })
    expect(result.structuredContent).toEqual({ result: '中文 Unicode ✓' })
    const invalid = await client.callTool({ name: 'echo', arguments: { text: '' } })
    expect(invalid.isError).toBe(true)
    expect(observed).toContain(mode === 'auto' ? 'modern' : 'legacy')
  } finally {
    await client.close()
    await handler.close()
  }
}

test('MCP v2 2026-07-28 auto negotiation supports real tool roundtrip and Zod4 schemas', async () => {
  await runClient('auto')
}, 20_000)

test('MCP v2 stdio entry retains full 2025 legacy tool and structured-output compatibility', async () => {
  await runClient('legacy')
}, 20_000)
