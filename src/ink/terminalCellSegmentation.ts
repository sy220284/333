import {
  type AnsiCode,
  type StyledChar,
  styledCharsFromTokens,
  tokenize,
} from '@alcalzone/ansi-tokenize'
import { getGraphemeSegmenter } from '../utils/intl.js'
import { stringWidth } from './stringWidth.js'
import {
  extractHyperlinkFromStyles,
  filterOutHyperlinkStyles,
  OSC8_PREFIX,
  type StylePool,
} from './screen.js'

/**
 * 333's TypeScript counterpart for Claude Code 2.1.317's private Bun.ant.CellSegmenter.
 * Builds Unicode display cells from terminal text while preserving ANSI styles
 * and OSC 8 hyperlinks. It uses existing 333 screen/style pools and grapheme
 * width semantics; no private Bun runtime or external native executable.
 *
 * Source reference: official 2.1.317 chunk-8t2gws05.js, CellSegmenter factory;
 * adaptation target: src/ink/output.ts -> Screen via setCellAt.
 */
export type TerminalCellSegment = {
  value: string
  width: number
  styleId: number
  hyperlink: string | undefined
}

export function segmentTerminalCells(
  text: string,
  stylePool: StylePool,
): TerminalCellSegment[] {
  return styledCharsWithGraphemeClustering(
    styledCharsFromTokens(tokenize(text)),
    stylePool,
  )
}

function stylesEqual(a: AnsiCode[], b: AnsiCode[]): boolean {
  if (a === b) return true // Reference equality fast path
  const len = a.length
  if (len !== b.length) return false
  if (len === 0) return true // Both empty
  for (let i = 0; i < len; i++) {
    if (a[i]!.code !== b[i]!.code) return false
  }
  return true
}

/**
 * Convert a string with ANSI codes into styled characters with proper grapheme
 * clustering. Fixes ansi-tokenize splitting grapheme clusters (like family
 * emojis) into individual code points.
 *
 * Also precomputes styleId + hyperlink per style run (not per char) — an
 * 80-char line with 3 style runs does 3 intern calls instead of 80.
 */
function styledCharsWithGraphemeClustering(
  chars: StyledChar[],
  stylePool: StylePool,
): TerminalCellSegment[] {
  const charCount = chars.length
  if (charCount === 0) return []

  const result: TerminalCellSegment[] = []
  const bufferChars: string[] = []
  let bufferStyles: AnsiCode[] = chars[0]!.styles

  for (let i = 0; i < charCount; i++) {
    const char = chars[i]!
    const styles = char.styles

    // Different styles means we need to flush and start new buffer
    if (bufferChars.length > 0 && !stylesEqual(styles, bufferStyles)) {
      flushBuffer(bufferChars.join(''), bufferStyles, stylePool, result)
      bufferChars.length = 0
    }

    bufferChars.push(char.value)
    bufferStyles = styles
  }

  // Final flush
  if (bufferChars.length > 0) {
    flushBuffer(bufferChars.join(''), bufferStyles, stylePool, result)
  }

  return result
}

function flushBuffer(
  buffer: string,
  styles: AnsiCode[],
  stylePool: StylePool,
  out: TerminalCellSegment[],
): void {
  // Compute styleId + hyperlink ONCE for the whole style run.
  // Every grapheme in this buffer shares the same styles.
  //
  // Extract and track hyperlinks separately, filter from styles.
  // Always check for OSC 8 codes to filter, not just when a URL is
  // extracted. The tokenizer treats OSC 8 close codes (empty URL) as
  // active styles, so they must be filtered even when no hyperlink
  // URL is present.
  const hyperlink = extractHyperlinkFromStyles(styles) ?? undefined
  const hasOsc8Styles =
    hyperlink !== undefined ||
    styles.some(
      s =>
        s.code.length >= OSC8_PREFIX.length && s.code.startsWith(OSC8_PREFIX),
    )
  const filteredStyles = hasOsc8Styles
    ? filterOutHyperlinkStyles(styles)
    : styles
  const styleId = stylePool.intern(filteredStyles)

  for (const { segment: grapheme } of getGraphemeSegmenter().segment(buffer)) {
    out.push({
      value: grapheme,
      width: stringWidth(grapheme),
      styleId,
      hyperlink,
    })
  }
}

