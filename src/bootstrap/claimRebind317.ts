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
    settingsCache,
    mdm,
    mdmRaw,
    remoteSettings,
    keychain,
    keychainPrefetch,
    auth,
    proxy,
    caCerts,
    mtls,
  ] = await Promise.all([
    import('../utils/env.js'),
    import('../utils/envUtils.js'),
    import('../utils/config.js'),
    import('../utils/settings/settingsCache.js'),
    import('../utils/settings/mdm/settings.js'),
    import('../utils/settings/mdm/rawRead.js'),
    import('../services/remoteManagedSettings/syncCache.js'),
    import('../utils/secureStorage/macOsKeychainHelpers.js'),
    import('../utils/secureStorage/keychainPrefetch.js'),
    import('../utils/auth.js'),
    import('../utils/proxy.js'),
    import('../utils/caCerts.js'),
    import('../utils/mtls.js'),
  ])

  // A pre-claim keychain subprocess must finish before the cache generation
  // changes. New reads must observe the accepted session's environment.
  await keychainPrefetch.resetKeychainPrefetchForClaim317()

  env.getGlobalClaudeFile.cache.clear()
  envUtils.getClaudeConfigHomeDir.cache.clear()
  config.rebindGlobalConfigForClaim317()
  settingsCache.resetSettingsCache()
  settingsCache.clearPluginSettingsBase()
  mdm.clearMdmSettingsCache()
  mdmRaw.resetMdmRawReadForClaim317()
  remoteSettings.resetSyncCache()

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
