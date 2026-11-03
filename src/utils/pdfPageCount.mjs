/**
 * Parse the page count from Poppler pdfinfo's human-readable output.
 * Metadata is user controlled and can contain newlines that imitate a
 * "Pages:" field. Use the greatest well-formed page count so an attacker
 * cannot force an undercount by inserting a smaller value before the real
 * count. For an ambiguous larger value this intentionally errs on the
 * restrictive side rather than letting oversized PDFs through.
 */
export function parsePdfInfoPageCount(stdout) {
  const matches = [...stdout.matchAll(/^Pages:[ \t]+([0-9]+)[ \t]*$/gm)]
  if (matches.length === 0) return null
  let max = 0
  for (const match of matches) {
    const count = Number(match[1])
    if (!Number.isSafeInteger(count) || count < 1) return null
    if (count > max) max = count
  }
  return max
}
