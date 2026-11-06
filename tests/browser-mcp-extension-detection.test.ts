import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const source = (path: string) => readFileSync(join(import.meta.dir, '..', path), 'utf8')
describe('浏览器自动化采用通用 MCP', () => {
  it('保留通用 MCP 传输与用户自选浏览器服务', () => {
    const code = source('src/services/mcp/client.ts')
    expect(code).toContain('StreamableHTTPClientTransport')
    expect(code).toContain('isMcpStdioServerConfig')
  })
  it('撤除专有扩展安装和云端通信入口', () => {
    expect(source('src/main.tsx')).not.toContain('setupClaudeInChrome')
    expect(source('src/entrypoints/cli.tsx')).not.toContain('--claude-in-chrome-mcp')
    expect(source('src/services/mcp/client.ts')).not.toContain('createClaudeForChromeMcpServer')
  })
})
