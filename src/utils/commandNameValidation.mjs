/**
 * Slash-command names are one token. MCP's visible "(MCP)" suffix is the
 * only space-bearing protocol form. Invalid names from user/plugin Markdown
 * must never poison the complete startup command registry.
 */
export function isValidCustomCommandName(name) {
  return typeof name === 'string' &&
    name.length > 0 && name.length <= 256 &&
    /^[^\s\u0000-\u001f\u007f]+(?: \(MCP\))?$/.test(name)
}
