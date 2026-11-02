import { getRemoteManagedSettingsSyncFromCache } from '../remoteManagedSettings/syncCacheState.js'
import { logForDebugging } from '../../utils/debug.js'
import { isSettingSourceEnabled } from '../../utils/settings/constants.js'
import { getSettingsForSource } from '../../utils/settings/settings.js'
import { createCustomTipProvider } from './customTips.mjs'

// Keep one cache for this process, matching the target's once-per-session file read.
const provider = createCustomTipProvider({
  getOverride: source => getSettingsForSource(source)?.spinnerTipsOverride,
  isEnabled: isSettingSourceEnabled,
  remotePolicyHasTipsFile: () =>
    !!getRemoteManagedSettingsSyncFromCache()?.spinnerTipsOverride?.tipsFile,
  warn: message => logForDebugging(message, { level: 'warn' }),
})

export const getCustomSpinnerTips = provider.collect
export const isDefaultSpinnerTipSuppressed = provider.suppressDefault
