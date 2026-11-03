/**
 * Parse GitHub repository references using exact hostname matching.
 * URL substrings may contain attacker-controlled prefix and suffix hosts.
 */
export function parseGithubRepository(input: string): string | null {
  const candidate = input.trim()
  let slug = candidate
  if (/^https:\/\//i.test(candidate) || /^ssh:\/\//i.test(candidate)) {
    let url: URL
    try { url = new URL(candidate) } catch { return null }
    if (
      url.hostname.toLowerCase() !== 'github.com' ||
      url.port || url.search || url.hash ||
      (url.protocol !== 'https:' && url.protocol !== 'ssh:') ||
      (url.username && (url.protocol !== 'ssh:' || url.username !== 'git')) ||
      url.password
    ) return null
    slug = url.pathname.replace(/^\//, '').replace(/\/$/, '')
  } else if (candidate.startsWith('git@github.com:')) {
    slug = candidate.slice('git@github.com:'.length)
  } else if (candidate.startsWith('github.com:')) {
    slug = candidate.slice('github.com:'.length)
  }
  slug = slug.replace(/\.git$/, '')
  // A repository slug has exactly two validated path components.
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]+$/.test(slug)) return null
  const [owner, repo] = slug.split('/')
  if (owner.endsWith('-') || repo === '.' || repo === '..') return null
  return slug
}
