import type { SettingSource } from '../../utils/settings/constants.js'
import type { Tip } from './types.js'

export type CustomTipEntry = string | Record<string, unknown>
export type CustomTipOverride = {
  excludeDefault?: boolean
  tips?: CustomTipEntry[]
  tipsFile?: string
  label?: string
}

export declare function createCustomTipProvider(options: {
  getOverride: (source: SettingSource) => CustomTipOverride | undefined
  isEnabled: (source: SettingSource) => boolean
  remotePolicyHasTipsFile: () => boolean
  warn: (message: string) => void
}): {
  collect: () => Promise<{ tips: Tip[]; trustedCount: number }>
  suppressDefault: () => boolean
}
