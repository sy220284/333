/** Safe, lossless import of common desktop MCP JSON files. */
export type ImportedMcpConfig =
  | { type: 'stdio'; command: string; args: string[]; env?: Record<string, string> }
  | { type: 'http' | 'sse'; url: string; headers?: Record<string, string>; headersHelper?: string }
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
    const fields = Object.keys(raw)
    const assertFields = (allowed: string[]) => {
      const invalid = fields.filter(field => !allowed.includes(field))
      if (invalid.length) throw new Error('配置含有暂不支持的字段，请先核对后导入：' + sourceName + ' · ' + invalid.join('、'))
    }
    const validateMap = (value: unknown, label: string) => {
      if (value === undefined) return undefined
      const parsed = asObject(value)
      if (!parsed || Object.keys(parsed).length > 128 || Object.entries(parsed).some(([key, item]) =>
          !key || key.length > 120 || typeof item !== 'string' || item.length > 8192))
        throw new Error('MCP ' + label + '不合法：' + sourceName)
      return parsed as Record<string, string>
    }
    if (typeof raw.command === 'string' && raw.command.trim().length > 0 && raw.command.length <= 1024) {
      assertFields(['type', 'command', 'args', 'env'])
      if (raw.type !== undefined && raw.type !== 'stdio') throw new Error('MCP 服务类型与启动方式冲突：' + sourceName)
      const args = raw.args === undefined ? [] : raw.args
      if (!Array.isArray(args) || args.length > 80 || args.some(arg => typeof arg !== 'string' || arg.length > 1000))
        throw new Error(`MCP 启动参数不合法：${sourceName}`)
      const parsedEnv = validateMap(raw.env, '环境变量')
      config = { type: 'stdio', command: raw.command, args: args as string[],
        ...(parsedEnv ? { env: parsedEnv as Record<string, string> } : {}) }
    } else if ((raw.type === 'http' || raw.type === 'sse' || (raw.type === undefined && typeof raw.url === 'string'))
        && typeof raw.url === 'string' && raw.url.length <= 2048) {
      assertFields(['type', 'url', 'headers', 'headersHelper'])
      const headers = validateMap(raw.headers, '请求头')
      if (raw.headersHelper !== undefined && (typeof raw.headersHelper !== 'string' || !raw.headersHelper || raw.headersHelper.length > 1024))
        throw new Error('MCP 请求头辅助命令不合法：' + sourceName)
      const url = new URL(raw.url)
      if (url.protocol !== 'https:' && url.protocol !== 'http:')
        throw new Error(`MCP URL 必须使用 HTTP(S)：${sourceName}`)
      if (url.username || url.password) throw new Error(`MCP URL 不允许内嵌账号密码：${sourceName}`)
      config = { type: raw.type === 'sse' ? 'sse' : 'http', url: url.toString(),
        ...(headers ? { headers } : {}),
        ...(typeof raw.headersHelper === 'string' ? { headersHelper: raw.headersHelper } : {}) }
    } else {
      throw new Error(`不支持的 MCP 服务配置：${sourceName}`)
    }
    servers.push({ sourceName, name, config })
  }
  if (servers.length === 0) throw new Error('配置中没有可导入的 MCP 服务器')
  if (servers.length > 100) throw new Error('单次最多导入 100 个 MCP 服务器')
  return servers
}
