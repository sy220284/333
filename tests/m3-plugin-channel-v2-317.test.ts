import { test, expect } from 'bun:test'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { channelServer } from '../src/cli/handlers/pluginInit.ts'

const repo = resolve(import.meta.dirname, '..')

test('plugin init MCP v2 channel template runs real stdio tool calls in both 2026 and 2025 protocol eras', async () => {
  const dir = mkdtempSync(join(tmpdir(), '333-channel-v2-'))
  try {
    // Generated plugin packages are normally installed by "bun run start".
    // Link the identical locked production dependencies for an isolated, offline test.
    symlinkSync(join(repo, 'node_modules'), join(dir, 'node_modules'), 'dir')
    writeFileSync(join(dir, 'server.ts'), channelServer('v2-channel'))
    for (const mode of ['auto', 'legacy'] as const) {
      const client = new Client({ name: '333-v2-template-test', version: '2.1.317' },
        mode === 'auto' ? { versionNegotiation: { mode: 'auto' } } : {})
      try {
        await client.connect(new StdioClientTransport({
          command: process.execPath, args: [join(dir, 'server.ts')], cwd: dir,
        }))
        const listed = await client.listTools()
        expect(listed.tools.some(tool => tool.name === 'reply')).toBe(true)
        const valid = await client.callTool({ name: 'reply', arguments: { text: 'hello 2026 ✓' } })
        expect(valid.isError).not.toBe(true)
        expect(valid.content).toContainEqual({ type: 'text', text: 'sent' })
        const invalid = await client.callTool({ name: 'reply', arguments: {} })
        expect(invalid.isError).toBe(true)
      } finally {
        await client.close()
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 60_000)
