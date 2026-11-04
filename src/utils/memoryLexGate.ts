/**
 * Decide whether CLAUDE.md needs a full Markdown AST for @include resolution
 * or comment removal. If false, leaving the raw content unchanged preserves
 * CRLF, very long list items, and exact file-offset semantics.
 */
export function shouldLexMemoryContent(content, resolveIncludes) : boolean {
  if (content.includes('<!--')) return true
  if (!resolveIncludes) return false
  // Includes can only start at the beginning or after whitespace. Addresses
  // like user@example.test do not require a Markdown parse.
  return /(?:^|\s)@/.test(content)
}
