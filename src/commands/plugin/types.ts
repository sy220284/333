import type { LocalJSXCommandOnDone } from '../../types/command.js'

/**
 * PluginSettings reads targetMarketplace/targetPlugin before narrowing a view.
 * Those fields remain optional on the common state, while each action still
 * receives a discriminant and its required routing data.
 */
type PluginNavigation = {
  targetMarketplace?: string
  targetPlugin?: string
  action?: 'uninstall' | 'enable' | 'disable' | 'remove' | 'update'
}

export type ViewState = PluginNavigation & (
  | { type: 'menu' | 'help' | 'marketplace-list' | 'marketplace-menu' }
  | { type: 'validate'; path?: string }
  | { type: 'add-marketplace'; initialValue?: string }
  | { type: 'discover-plugins' }
  | { type: 'browse-marketplace'; targetMarketplace: string }
  | { type: 'manage-plugins' }
  | { type: 'manage-marketplaces' }
)

export interface PluginSettingsProps {
  onComplete: LocalJSXCommandOnDone
  args?: string
  showMcpRedirectMessage?: boolean
}
