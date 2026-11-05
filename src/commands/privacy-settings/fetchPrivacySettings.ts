/**
 * 2.1.310 /privacy-settings reads the current server value, not the
 * session-memoized value. Both account settings and notice configuration
 * must be available before rendering the privacy-control dialog.
 */
export type PrivacyFetchResult<T> = { success: true; data: T } | { success: false }
export type CachedPrivacySettingsGetter<T> = (() => Promise<PrivacyFetchResult<T>>) & {
  cache?: { clear?: () => void }
}

export async function fetchPrivacySettingsFresh<TSettings, TConfig>(
  getSettings: CachedPrivacySettingsGetter<TSettings>,
  getConfig: () => Promise<PrivacyFetchResult<TConfig>>,
): Promise<{ success: true; settings: TSettings; config: TConfig } | { success: false }> {
  getSettings.cache?.clear?.()
  const [settings, config] = await Promise.all([getSettings(), getConfig()])
  if (!settings.success || !config.success) {
    return { success: false }
  }
  return { success: true, settings: settings.data, config: config.data }
}
