/**
 * 2.1.310 /privacy-settings reads the current server value, not the
 * session-memoized value. Both account settings and notice configuration
 * must be available before rendering the privacy-control dialog.
 */
export async function fetchPrivacySettingsFresh(getSettings, getConfig) {
  getSettings.cache.clear?.()
  const [settings, config] = await Promise.all([getSettings(), getConfig()])
  if (!settings.success || !config.success) {
    return { success: false }
  }
  return { success: true, settings: settings.data, config: config.data }
}
