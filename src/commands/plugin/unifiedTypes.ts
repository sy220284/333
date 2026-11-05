import type { MCPServerConnection, ConfigScope } from '../../services/mcp/types.js'
import type { LoadedPlugin, PluginError } from '../../types/plugin.js'

/**
 * Installed plugins and MCP connections share the /plugin management list.
 * Reconstructed from the item producers in ManagePlugins.tsx and the
 * discriminated consumers in UnifiedInstalledCell.tsx.
 */
type PluginScope = 'user' | 'project' | 'local' | 'managed' | 'builtin'

type InstalledBase = {
  id: string
  name: string
  description?: string
}

export type UnifiedInstalledItem =
  | (InstalledBase & {
      type: 'plugin'
      marketplace: string
      scope: PluginScope
      isEnabled: boolean
      errorCount: number
      errors: PluginError[]
      plugin: LoadedPlugin
      pendingEnable?: boolean
      pendingUpdate?: boolean
      pendingToggle?: 'will-enable' | 'will-disable'
    })
  | (InstalledBase & {
      type: 'failed-plugin'
      marketplace: string
      scope: Exclude<PluginScope, 'builtin'>
      errorCount: number
      errors: PluginError[]
    })
  | (InstalledBase & {
      type: 'flagged-plugin'
      marketplace: string
      scope: 'flagged'
      reason: 'delisted'
      text: string
      flaggedAt: string
    })
  | (InstalledBase & {
      type: 'mcp'
      scope: ConfigScope
      status: 'connected' | 'disabled' | 'pending' | 'needs-auth' | 'failed'
      client: MCPServerConnection
      indented?: boolean
    })
