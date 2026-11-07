import React, { useEffect } from 'react'
import { useNotifications } from '../../context/notifications.js'
import { getIsRemoteMode } from '../../bootstrap/state.js'
import { Text } from '../../ink.js'
import type { MCPServerConnection } from '../../services/mcp/types.js'

type Props = { mcpClients?: MCPServerConnection[] }
const EMPTY_MCP_CLIENTS: MCPServerConnection[] = []

/** Reports connection and authorization failures for explicitly configured MCP servers. */
export function useMcpConnectivityStatus({ mcpClients = EMPTY_MCP_CLIENTS }: Props): void {
  const { addNotification } = useNotifications()

  useEffect(() => {
    if (getIsRemoteMode()) return

    const failed = mcpClients.filter(
      client => client.type === 'failed' &&
        client.config.type !== 'sse-ide' && client.config.type !== 'ws-ide',
    )
    const needsAuth = mcpClients.filter(client => client.type === 'needs-auth')

    if (failed.length > 0) {
      addNotification({
        key: 'mcp-failed',
        jsx: <React.Fragment><Text color="error">{failed.length} MCP {failed.length === 1 ? 'server' : 'servers'} failed</Text><Text dimColor> · /mcp</Text></React.Fragment>,
        priority: 'medium',
      })
    }
    if (needsAuth.length > 0) {
      addNotification({
        key: 'mcp-needs-auth',
        jsx: <React.Fragment><Text color="warning">{needsAuth.length} MCP {needsAuth.length === 1 ? 'server needs' : 'servers need'} auth</Text><Text dimColor> · /mcp</Text></React.Fragment>,
        priority: 'medium',
      })
    }
  }, [addNotification, mcpClients])
}
