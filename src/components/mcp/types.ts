/**
 * MCP 菜单视图的类型边界。
 * 依据 MCPSettings.tsx 构造器、extractAgentMcpServers() 与四种菜单分支恢复。
 */
import type {
  ConfigScope,
  MCPServerConnection,
  McpClaudeAIProxyServerConfig,
  McpHTTPServerConfig,
  McpSSEServerConfig,
  McpStdioServerConfig,
} from '../../services/mcp/types.js'

type BaseServerInfo = {
  name: string
  client: MCPServerConnection
  scope: ConfigScope
}

export type StdioServerInfo = BaseServerInfo & {
  transport: 'stdio'
  config: McpStdioServerConfig
}

export type SSEServerInfo = BaseServerInfo & {
  transport: 'sse'
  config: McpSSEServerConfig
  isAuthenticated: boolean | undefined
}

export type HTTPServerInfo = BaseServerInfo & {
  transport: 'http'
  config: McpHTTPServerConfig
  isAuthenticated: boolean | undefined
}

export type ClaudeAIServerInfo = BaseServerInfo & {
  transport: 'claudeai-proxy'
  config: McpClaudeAIProxyServerConfig
  isAuthenticated: false
}

export type ServerInfo =
  | StdioServerInfo
  | SSEServerInfo
  | HTTPServerInfo
  | ClaudeAIServerInfo

type AgentServerBase = {
  name: string
  sourceAgents: string[]
}

export type AgentMcpServerInfo =
  | (AgentServerBase & { transport: 'stdio'; command: string; needsAuth: false })
  | (AgentServerBase & { transport: 'sse'; url: string; needsAuth: true })
  | (AgentServerBase & { transport: 'http'; url: string; needsAuth: true })
  | (AgentServerBase & { transport: 'ws'; url: string; needsAuth: false })

export type MCPViewState =
  | { type: 'list'; defaultTab?: string }
  | { type: 'server-menu'; server: ServerInfo }
  | { type: 'server-tools'; server: ServerInfo }
  | { type: 'server-tool-detail'; server: ServerInfo; toolIndex: number }
  | { type: 'agent-server-menu'; agentServer: AgentMcpServerInfo }
