/**
 * Rebind cached startup state after the official 317 --preload/--bg-spare claim.
 *
 * Called once, after environment, cwd and session identity have switched but
 * before main.tsx is imported. The warm process had already loaded MDM,
 * keychain and configuration for its previous identity. Invalidating them as
 * one operation prevents the claimed session from inheriting credentials,
 * trusted settings, filesystem paths or proxy agents from that identity.
 */
export async function rebindClaimedSessionDependencies317(): Promise<void> {
  const [
    env,
    envUtils,
    config,
    state,
    settingsCache,
    mdm,
    mdmRaw,
    remoteSettings,
    growthBook,
    keychain,
    keychainPrefetch,
    auth,
    fastPathSettings,
    proxy,
    caCerts,
    mtls,
  ] = await Promise.all([
    import('../utils/env.js'),
    import('../utils/envUtils.js'),
    import('../utils/config.js'),
    import('./state.js'),
    import('../utils/settings/settingsCache.js'),
    import('../utils/settings/mdm/settings.js'),
    import('../utils/settings/mdm/rawRead.js'),
    import('../services/remoteManagedSettings/syncCache.js'),
    import('../services/analytics/growthbook.js'),
    import('../utils/secureStorage/macOsKeychainHelpers.js'),
    import('../utils/secureStorage/keychainPrefetch.js'),
    import('../utils/auth.js'),
    import('./fastPathSettings317.ts'),
    import('../utils/proxy.js'),
    import('../utils/caCerts.js'),
    import('../utils/mtls.js'),
  ])

  // A pre-claim keychain subprocess must finish before the cache generation
  // changes. New reads must observe the accepted session's environment.
  await keychainPrefetch.resetKeychainPrefetchForClaim317()

  env.getGlobalClaudeFile.cache.clear()
  envUtils.getClaudeConfigHomeDir.cache.clear()
  // Once the env-derived config root is invalidated, reset Storage V5's
  // memoized project path and transcript owner before the claimed main starts.
  // Flush the outgoing warm writer first; propagate any write failure.
  const { rebindSessionStorageForClaim317 } = await import('../utils/sessionStorage.js')
  await rebindSessionStorageForClaim317()
  config.rebindGlobalConfigForClaim317()
  // Official hUn invokes HMn() for every new claim: workspace trust from
  // a previous warm identity must never authorize the accepted workspace.
  state.setSessionTrustAccepted(false)
  settingsCache.resetSettingsCache()
  settingsCache.clearPluginSettingsBase()
  mdm.clearMdmSettingsCache()
  mdmRaw.resetMdmRawReadForClaim317()
  remoteSettings.resetSyncCache()
  // Official hUn() resets feature targeting for the claimed identity while
  // preserving exposure bookkeeping already emitted by the warm process.
  growthBook.resetGrowthBook({ preservePendingExposures: true,
    preserveLoggedExposures: true })
  fastPathSettings.resetFastPathSettingsForClaim317()

  auth.clearOAuthTokenCache()
  auth.getApiKeyFromConfigOrMacOSKeychain.cache.clear()
  auth.clearApiKeyHelperCache()
  auth.clearAwsCredentialsCache()
  auth.clearGcpCredentialsCache()
  keychain.clearKeychainCache()
  proxy.clearProxyCache()
  caCerts.clearCACertsCache()
  mtls.clearMTLSCache()
}
