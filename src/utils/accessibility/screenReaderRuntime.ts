import { isSettingSourceEnabled } from '../settings/constants.js'
import { getSettingsForSource } from '../settings/settings.js'
import { resolveScreenReaderMode, screenReaderChildEnvironment } from './screenReaderMode.ts'

const TRUSTED_SOURCES = ['policySettings', 'flagSettings', 'userSettings'] as const

/** Enablement reads the original settings source, not a merged settings
 * object: a project/local settings file cannot switch on terminal a11y.
 */
export function getScreenReaderMode() {
  return resolveScreenReaderMode({
    argv: process.argv,
    env: process.env,
    trustedSettings: TRUSTED_SOURCES
      .filter(isSettingSourceEnabled)
      .map(source => ({ settings: getSettingsForSource(source) })),
  })
}
export function isScreenReaderEnabled(): boolean {
  return getScreenReaderMode().enabled
}
let startupActivationSource: string | undefined

export function getScreenReaderActivationSource(): string | undefined {
  // The parent process exports CLAUDE_AX_SCREEN_READER to child CLIs.
  // Preserve the first trusted source before that export changes precedence.
  return startupActivationSource ?? getScreenReaderMode().source
}
export function getScreenReaderSubprocessEnvironment(): Record<string,string> {
  const mode = getScreenReaderMode()
  if (mode.enabled && startupActivationSource === undefined) {
    startupActivationSource = mode.source
  }
  return screenReaderChildEnvironment(mode)
}
