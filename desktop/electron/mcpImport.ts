/** Safe, lossless import of common desktop MCP JSON files. */
export type ImportedMcpConfig =
  | { type: 'stdio'; command: string; args: string[]; env?: Record<string, string> }
  | { type: 'http' | 'sse'; url: string }
export type ImportedMcpServer = { sourceName: string; name: string; config: ImportedMcpConfig }

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

export function parseMcpImportFile(input: unknown): ImportedMcpServer[] {
  const root = asObject(input)
  if (!root) throw new Error('MCP 配置根节点必须是对象')
  const configs = asObject(root.mcpServers)
  if (!configs) throw new Error('配置文件缺少 mcpServers 对象')
  const servers: ImportedMcpServer[] = []
  const used = new Set<string>()
  for (const [sourceName, value] of Object.entries(configs)) {
    const raw = asObject(value)
    if (!raw) throw new Error(`无效 MCP 服务器配置：${sourceName}`)
    let name = sourceName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 76)
    if (!name) throw new Error(`MCP 服务名称无效：${sourceName}`)
    let suffix = 2
    while (used.has(name)) name = `${name.slice(0, 72)}_${suffix++}`
    used.add(name)
    let config: ImportedMcpConfig
    if (typeof raw.command === 'string' && raw.command.trim().length > 0 && raw.command.length <= 1024) {
      const args = raw.args === undefined ? [] : raw.args
      if (!Array.isArray(args) || args.length > 80 || args.some(arg => typeof arg !== 'string' || arg.length > 1000))
        throw new Error(`MCP 启动参数不合法：${sourceName}`)
      const parsedEnv = raw.env === undefined ? undefined : asObject(raw.env)
      if (raw.env !== undefined && !parsedEnv) throw new Error(`MCP 环境变量不合法：${sourceName}`)
      if (parsedEnv && (Object.keys(parsedEnv).length > 128 || Object.entries(parsedEnv).some(([key, val]) =>
          key.length > 120 || typeof val !== 'string' || val.length > 8192)))
        throw new Error(`MCP 环境变量超出长度限制：${sourceName}`)
      config = { type: 'stdio', command: raw.command, args: args as string[],
        ...(parsedEnv ? { env: parsedEnv as Record<string, string> } : {}) }
    } else if ((raw.type === 'http' || raw.type === 'sse' || (raw.type === undefined && typeof raw.url === 'string'))
        && typeof raw.url === 'string' && raw.url.length <= 2048) {
      const url = new URL(raw.url)
      if (url.protocol !== 'https:' && url.protocol !== 'http:')
        throw new Error(`MCP URL 必须使用 HTTP(S)：${sourceName}`)
      if (url.username || url.password) throw new Error(`MCP URL 不允许内嵌账号密码：${sourceName}`)
      config = { type: raw.type === 'sse' ? 'sse' : 'http', url: url.toString() }
    } else {
      throw new Error(`不支持的 MCP 服务配置：${sourceName}`)
    }
    servers.push({ sourceName, name, config })
  }
  if (servers.length === 0) throw new Error('配置中没有可导入的 MCP 服务器')
  if (servers.length > 100) throw new Error('单次最多导入 100 个 MCP 服务器')
  return servers
}
