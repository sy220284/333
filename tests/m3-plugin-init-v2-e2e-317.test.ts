import { test, expect } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { channelServer } from '../src/cli/handlers/pluginInit.ts'

test('plugin init generated MCP v2 channel server negotiates, lists and calls its actual reply tool', async () => {
  const root = resolve(import.meta.dirname, '..')
  await mkdir(join(root, '.rebuild'), { recursive: true })
  const cwd = await mkdtemp(join(root, '.rebuild', 'channel-v2-'))
  await writeFile(join(cwd, 'server.ts'), channelServer('channel-v2-probe'))
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['server.ts'],
    cwd,
    env: { ...process.env },
  })
  const client = new Client({ name: '333-plugin-init-v2-test', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } })
  try {
    await client.connect(transport)
    const discovered = await client.listTools()
    expect(discovered.tools.map(tool => tool.name)).toContain('reply')
    expect(discovered.tools.find(tool => tool.name === 'reply')?.inputSchema).toBeTruthy()
    const success = await client.callTool({ name: 'reply', arguments: { text: '你好，MCP v2' } })
    expect(success.isError).not.toBe(true)
    expect(success.content).toContainEqual({ type: 'text', text: 'sent' })
    const rejected = await client.callTool({ name: 'reply', arguments: {} })
    expect(rejected.isError).toBe(true)
  } finally {
    await client.close()
    await rm(cwd, { recursive: true, force: true })
  }
}, 30_000)
