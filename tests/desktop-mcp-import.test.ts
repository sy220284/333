import { expect, test } from 'bun:test'
import { parseMcpImportFile } from '../desktop/electron/mcpImport.ts'
import { DesktopRequestSchema } from '../src/services/desktop/protocol.ts'

test('桌面 MCP 导入保留 stdio 参数和敏感环境变量，不泄漏到预览结构', () => {
  const parsed = parseMcpImportFile({
    mcpServers: {
      'github.tools': { command: 'npx', args: ['-y', '@example/mcp'], env: { TOKEN: 'test-secret' } },
      remote: { type: 'sse', url: 'https://mcp.example.test/events' },
    },
  })
  expect(parsed).toHaveLength(2)
  expect(parsed[0]?.name).toBe('github_tools')
  expect(parsed[0]?.config).toEqual({ type: 'stdio', command: 'npx', args: ['-y', '@example/mcp'], env: { TOKEN: 'test-secret' } })
  expect(parsed[1]?.config).toEqual({ type: 'sse', url: 'https://mcp.example.test/events' })
  const wire = DesktopRequestSchema.safeParse({ id: 'mcp-1', method: 'mcp.add', name: parsed[0]?.name, scope: 'project', config: parsed[0]?.config })
  expect(wire.success).toBe(true)
})

test('MCP 导入拒绝无效字段和高风险配置', () => {
  expect(() => parseMcpImportFile({})).toThrow('mcpServers')
  expect(() => parseMcpImportFile({ mcpServers: {} })).toThrow('没有可导入')
  expect(() => parseMcpImportFile({ mcpServers: { bad: { command: 'cmd', env: { KEY: 123 } } } })).toThrow('环境变量')
  expect(() => parseMcpImportFile({ mcpServers: { bad: { type: 'http', url: 'file:///etc/passwd' } } })).toThrow('HTTP')
  expect(() => parseMcpImportFile({ mcpServers: { bad: { type: 'http', url: 'https://user:pass@host.example' } } })).toThrow('账号密码')
})

test('桌面系统诊断和清理令牌均由严格协议校验', () => {
  expect(DesktopRequestSchema.safeParse({ id: '1', method: 'system.diagnostics' }).success).toBe(true)
  expect(DesktopRequestSchema.safeParse({ id: '2', method: 'data.purge.preview' }).success).toBe(true)
  expect(DesktopRequestSchema.safeParse({ id: '3', method: 'data.purge.apply', token: 'invalid' }).success).toBe(false)
  expect(DesktopRequestSchema.safeParse({ id: '4', method: 'data.purge.apply', token: '123e4567-e89b-42d3-a456-426614174000' }).success).toBe(true)
})

test('远程 MCP 导入保留认证请求头，未知字段明确阻止避免丢失配置', () => {
  const [server] = parseMcpImportFile({ mcpServers: {
    remote: { type: 'http', url: 'https://mcp.example.test/mcp', headers: { Authorization: 'Bearer secret' } },
  } })
  expect(server?.config).toEqual({ type: 'http', url: 'https://mcp.example.test/mcp', headers: { Authorization: 'Bearer secret' } })
  expect(DesktopRequestSchema.safeParse({ id: 'remote-1', method: 'mcp.add', name: server?.name,
    scope: 'user', config: server?.config }).success).toBe(true)
  expect(() => parseMcpImportFile({ mcpServers: { bad: { type: 'http',
    url: 'https://mcp.example.test/mcp', randomSetting: 'unsupported' } } })).toThrow('暂不支持的字段')
  expect(() => parseMcpImportFile({ mcpServers: { bad: { command: 'npx', cwd: '/tmp' } } })).toThrow('暂不支持的字段')
})
