import type { LocalJSXCommandOnDone } from '../../types/command.js'

/**
 * Restored from the actual PluginSettings state constructors and every
 * setViewState consumer in AddMarketplace/BrowseMarketplace/ManagePlugins.
 * Keep each screen's payload tied to its discriminant.
 */
export type ViewState =
  | { type: 'menu' | 'help' | 'marketplace-list' | 'marketplace-menu' }
  | { type: 'validate'; path?: string }
  | { type: 'add-marketplace'; initialValue?: string }
  | { type: 'discover-plugins'; targetPlugin?: string }
  | {
      type: 'browse-marketplace'
      targetMarketplace: string
      targetPlugin?: string
    }
  | {
      type: 'manage-plugins'
      targetPlugin?: string
      targetMarketplace?: string
      action?: 'uninstall' | 'enable' | 'disable'
    }
  | {
      type: 'manage-marketplaces'
      targetMarketplace?: string
      action?: 'remove' | 'update'
    }

export interface PluginSettingsProps {
  onComplete: LocalJSXCommandOnDone
  args?: string
  showMcpRedirectMessage?: boolean
}
