/** 2.1.317 explicit FORCE_HYPERLINK setting takes priority over terminal detection. */
export function getForcedHyperlinkSetting(env) {
  const value = env?.FORCE_HYPERLINK
  if (typeof value !== 'string') return null
  switch (value.trim().toLowerCase()) {
    case '0': case 'false': case 'no': case 'off': return false
    case '1': case 'true': case 'yes': case 'on': return true
    default: return null
  }
}
