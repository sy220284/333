/**
 * Biome RDJSON reports source positions with 1-based line numbers.
 * GitHub delta comparisons must match the diagnostic's own source line,
 * even when nearby code insertions move its position.
 */
export function diagnosticSourceLineToken(lines, line) {
  if (!Number.isInteger(line) || line < 1) return ''
  return (lines[line - 1] ?? '').trim().replace(/\s+/g, ' ')
}
