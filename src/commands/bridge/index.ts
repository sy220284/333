import { feature } from 'bun:bundle'
import { isBridgeEnabled, isRemoteControlDisabledBySettings } from '../../bridge/bridgeEnabled.js'
import type { Command } from '../../commands.js'

function isEnabled(): boolean {
  if (!feature('BRIDGE_MODE')) {
    return false
  }
  // Keep the command routable when it is disabled, so the user receives the
  // explanatory policy message rather than "Unknown command".
  return isBridgeEnabled() || isRemoteControlDisabledBySettings()
}

const bridge = {
  type: 'local-jsx',
  name: 'remote-control',
  aliases: ['rc'],
  description: 'Connect this terminal for remote-control sessions',
  argumentHint: '[name]',
  isEnabled,
  get isHidden() {
    return !isEnabled()
  },
  immediate: true,
  load: () => import('./bridge.js'),
} satisfies Command

export default bridge
