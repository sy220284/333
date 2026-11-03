/**
 * 2.1.317 network disclosure gate. Only inspect the active account email,
 * and only for built-in web and shell tools. The email is never logged.
 */
export function shouldConfirmAccountEmailDisclosure(toolName, input, email) {
  if (typeof email !== 'string' || !email.includes('@')) return false
  const target = email.trim().toLowerCase()
  if (target.length < 3) return false
  let submitted
  switch (toolName) {
    case 'Bash':
    case 'PowerShell':
      submitted = input.command
      break
    case 'WebFetch':
      submitted = [input.url, input.prompt].join(' ')
      break
    case 'WebSearch':
      submitted = [input.query, ...(Array.isArray(input.allowed_domains) ? input.allowed_domains : []),
        ...(Array.isArray(input.blocked_domains) ? input.blocked_domains : [])].join(' ')
      break
    default:
      return false
  }
  if (typeof submitted !== 'string') return false
  const normalized = submitted.toLowerCase()
  return normalized.includes(target) || normalized.includes(encodeURIComponent(target).toLowerCase())
}
