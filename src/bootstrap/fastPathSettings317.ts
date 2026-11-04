import * as semver from 'semver'

export type RequiredVersionPolicy317 = {
  requiredMinimumVersion?: unknown
  requiredMaximumVersion?: unknown
}

/**
 * 2.1.317 cli.js -> chunk-e3npg1mt.js. Only organization-controlled
 * policySettings may supply these restrictions; caller must not pass merged
 * project or user settings. Use semver.parse just like the upstream helper.
 */
export function checkRequiredFastPathVersion317(
  currentVersion: string,
  policy: RequiredVersionPolicy317 | null,
  topLevelCommand?: string,
): string | null {
  // Updating/repairing Claude must remain possible under version restrictions.
  if (topLevelCommand === 'update' || topLevelCommand === 'install' || topLevelCommand === 'doctor')
    return null
  if (!policy || (!policy.requiredMinimumVersion && !policy.requiredMaximumVersion))
    return null
  const current = semver.parse(currentVersion)?.version
  if (!current) return null
  const minimum = policy.requiredMinimumVersion
  if (typeof minimum === 'string' && minimum) {
    const parsed = semver.parse(minimum)?.version
    if (!parsed) {
      process.stderr.write(`requiredMinimumVersion '${minimum}' is not a valid semver version — ignoring\n`)
    } else if (!semver.gte(current, parsed)) {
      return `Claude Code ${currentVersion} is older than the minimum version required by your organization (${minimum}).\nUpdate Claude Code using your organization's approved method, then try again. If automatic updates are available, \`claude update\` may also work.`
    }
  }
  const maximum = policy.requiredMaximumVersion
  if (typeof maximum === 'string' && maximum) {
    const parsed = semver.parse(maximum)?.version
    if (!parsed) {
      process.stderr.write(`requiredMaximumVersion '${maximum}' is not a valid semver version — ignoring\n`)
    } else if (!semver.lte(current, parsed)) {
      return `Claude Code ${currentVersion} is newer than the maximum version allowed by your organization (${maximum}).\nYour organization requires version ${maximum} or older. Install an approved version using your organization's approved method. \`claude install <version>\` may also work.`
    }
  }
  return null
}

let startupSettingsPromise: Promise<RequiredVersionPolicy317 | null> | undefined

/**
 * The upstream startup invokes ensureFastPathSettingsLoaded before the
 * dedicated daemon/spare/PTY/preload handlers. Those handlers never execute
 * the ordinary Commander's preAction hook, so initialise the same config,
 * MDM, keychain and trusted environment dependencies here.
 */
export function ensureFastPathSettingsLoaded317(): Promise<RequiredVersionPolicy317 | null> {
  if (!startupSettingsPromise) {
    startupSettingsPromise = (async () => {
      const [config, mdm, keychain, managedEnv, settings] = await Promise.all([
        import('../utils/config.js'),
        import('../utils/settings/mdm/settings.js'),
        import('../utils/secureStorage/keychainPrefetch.js'),
        import('../utils/managedEnv.js'),
        import('../utils/settings/settings.js'),
      ])
      mdm.startMdmSettingsLoad()
      keychain.startKeychainPrefetch()
      await Promise.all([
        mdm.ensureMdmSettingsLoaded(),
        keychain.ensureKeychainPrefetchCompleted(),
      ])
      config.enableConfigs()
      managedEnv.applySafeConfigEnvironmentVariables()
      // Policy source has precedence remote > MDM > managed-file > HKCU.
      // Project/local settings cannot lower the organization's version gate.
      return settings.getSettingsForSource('policySettings')
    })().catch(error => {
      startupSettingsPromise = undefined
      throw error
    })
  }
  return startupSettingsPromise
}
