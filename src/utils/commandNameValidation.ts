/**
 * Slash-command names are one token. MCP's visible "(MCP)" suffix is the
 * only space-bearing protocol form. Invalid names from user/plugin Markdown
 * must never poison the complete startup command registry.
 */
export function isValidCustomCommandName(name: unknown): name is string {
  if (typeof name !== 'string' || name.length === 0 || name.length > 256) return false
  const suffix = ' (MCP)'
  const command = name.endsWith(suffix) ? name.slice(0, -suffix.length) : name
  if (command.length === 0) return false
  return [...command].every(char => {
    const code = char.codePointAt(0)
    return !/\s/.test(char) && code !== undefined && code > 0x1f && code !== 0x7f
  })
}
