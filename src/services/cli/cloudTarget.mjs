/**
 * Normalize the native 2.1.310 --cloud target without treating an arbitrary
 * URL as an authorized session. Descriptions are opaque user prompts.
 */
export function resolveCloudTarget(value, positionalPrompt) {
  const target = value === true || value == null ? '' : String(value).trim()
  const fallback = typeof positionalPrompt === 'string' ? positionalPrompt.trim() : ''
  if (/^(?:session_|cse_)[a-zA-Z0-9_-]+$/.test(target)) {
    return { kind: 'attach', sessionId: target }
  }
  if (/^https?:\/\//i.test(target)) {
    const url = new URL(target)
    if (url.protocol !== 'https:' || url.hostname !== 'claude.ai') {
      throw new Error('Cloud session URL must use https://claude.ai/code/')
    }
    const match = /^\/code\/(?:session\/)?(session_[A-Za-z0-9_-]+|cse_[A-Za-z0-9_-]+)\/?$/.exec(url.pathname)
    if (!match) throw new Error('Invalid Claude Code cloud session URL')
    return {kind:'attach', sessionId:match[1]}
  }
  if (target) return { kind: 'create', description: target }
  if (fallback) return { kind: 'create', description: fallback }
  return { kind: 'create', description: '' }
}
export function validateCloudEnvironment(value) {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !/^ccpool_[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('--environment expects a ccpool_... environment identifier')
  }
  return value
}
