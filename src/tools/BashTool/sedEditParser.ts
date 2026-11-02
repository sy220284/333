/**
 * Parser for sed edit commands (-i flag substitutions)
 * Extracts file paths and substitution patterns to enable file-edit-style rendering
 */

import { tryParseShellCommand } from '../../utils/bash/shellQuote.js'

// BRE→ERE conversion placeholders (null-byte sentinels, never appear in user input)
const BACKSLASH_PLACEHOLDER = '\x00BACKSLASH\x00'
const PLUS_PLACEHOLDER = '\x00PLUS\x00'
const QUESTION_PLACEHOLDER = '\x00QUESTION\x00'
const PIPE_PLACEHOLDER = '\x00PIPE\x00'
const LPAREN_PLACEHOLDER = '\x00LPAREN\x00'
const RPAREN_PLACEHOLDER = '\x00RPAREN\x00'
const BACKSLASH_PLACEHOLDER_RE = new RegExp(BACKSLASH_PLACEHOLDER, 'g')
const PLUS_PLACEHOLDER_RE = new RegExp(PLUS_PLACEHOLDER, 'g')
const QUESTION_PLACEHOLDER_RE = new RegExp(QUESTION_PLACEHOLDER, 'g')
const PIPE_PLACEHOLDER_RE = new RegExp(PIPE_PLACEHOLDER, 'g')
const LPAREN_PLACEHOLDER_RE = new RegExp(LPAREN_PLACEHOLDER, 'g')
const RPAREN_PLACEHOLDER_RE = new RegExp(RPAREN_PLACEHOLDER, 'g')

/** Keep the confirmed preview consistent with the content actually written.
 * The permission UI normalizes CRLF before calculating its diff.
 */
export function assertSedPreviewUnchanged(
  filePath: string,
  currentContent: string,
  previewContent: string,
): void {
  if (currentContent.replaceAll('\r\n', '\n') !== previewContent) {
    throw new Error(
      `The file changed after the sed edit preview: ${filePath}. Review the updated file and retry.`,
    )
  }
}

export type SedEditInfo = {
  /** The file path being edited */
  filePath: string
  /** The search pattern (regex) */
  pattern: string
  /** The replacement string */
  replacement: string
  /** Substitution flags (g, i, etc.) */
  flags: string
  /** Whether to use extended regex (-E or -r flag) */
  extendedRegex: boolean
}

/**
 * Check if a command is a sed in-place edit command
 * Returns true only for simple sed -i 's/pattern/replacement/flags' file commands
 */
export function isSedInPlaceEdit(command: string): boolean {
  const info = parseSedEditCommand(command)
  return info !== null
}

/**
 * Parse a sed edit command and extract the edit information
 * Returns null if the command is not a valid sed in-place edit
 */
export function parseSedEditCommand(command: string): SedEditInfo | null {
  const trimmed = command.trim()

  // Must start with sed
  const sedMatch = trimmed.match(/^\s*sed\s+/)
  if (!sedMatch) return null

  const withoutSed = trimmed.slice(sedMatch[0].length)
  const parseResult = tryParseShellCommand(withoutSed)
  if (!parseResult.success) return null
  const tokens = parseResult.tokens

  // This preview replaces the shell command with an in-process edit.
  // Shell operators, redirections and globs must remain on the Bash path.
  if (tokens.some(token => typeof token !== 'string')) return null
  const args = tokens as string[]
  if (/[\x60]/.test(trimmed) || trimmed.includes('$(')) return null

  // Parse flags and arguments
  let hasInPlaceFlag = false
  let extendedRegex = false
  let expression: string | null = null
  let filePath: string | null = null

  let i = 0
  while (i < args.length) {
    const arg = args[i]
    if (arg === undefined) return null

    // Handle -i flag (with or without backup suffix)
    if (arg === '-i' || arg === '--in-place') {
      // macOS BSD sed requires an explicit separate empty backup suffix,
      // whereas GNU sed interprets that argument as an edit script.
      if (arg === '--in-place' && process.platform === 'darwin') return null
      const hasEmptySuffix = args[i + 1] === ''
      if ((process.platform === 'darwin') !== hasEmptySuffix) return null
      hasInPlaceFlag = true
      i += hasEmptySuffix ? 2 : 1
      continue
    }
    if (arg.startsWith('-i')) {
      // GNU/BSD backup suffixes have side effects beyond the preview.
      return null
    }

    // Handle extended regex flags
    if (arg === '-E' || arg === '-r' || arg === '--regexp-extended') {
      extendedRegex = true
      i++
      continue
    }

    // Handle -e flag with expression
    if (arg === '-e' || arg === '--expression') {
      const nextArg = args[i + 1]
      if (typeof nextArg === 'string') {
        // Only support single expression
        if (expression !== null) return null
        expression = nextArg
        i += 2
        continue
      }
      return null
    }
    if (arg.startsWith('--expression=')) {
      if (expression !== null) return null
      expression = arg.slice('--expression='.length)
      i++
      continue
    }

    // Skip other flags we don't understand
    if (arg.startsWith('-')) {
      // Unknown flag - not safe to parse
      return null
    }

    // Non-flag argument
    if (expression === null) {
      // First non-flag arg is the expression
      expression = arg
    } else if (filePath === null) {
      // Second non-flag arg is the file path
      filePath = arg
    } else {
      // More than one file - not supported for simple rendering
      return null
    }

    i++
  }

  // Must have -i flag, expression, and file path
  if (!hasInPlaceFlag || !expression || !filePath) {
    return null
  }

  // Parse the substitution expression: s/pattern/replacement/flags
  // Only support / as delimiter for simplicity
  const substMatch = expression.match(/^s\//)
  if (!substMatch) {
    return null
  }

  const rest = expression.slice(2) // Skip 's/'

  // Find pattern and replacement by tracking escaped characters
  let pattern = ''
  let replacement = ''
  let flags = ''
  let state: 'pattern' | 'replacement' | 'flags' = 'pattern'
  let j = 0

  while (j < rest.length) {
    const char = rest.charAt(j)

    if (char === '\\' && j + 1 < rest.length) {
      // Escaped character
      if (state === 'pattern') {
        pattern += char + rest[j + 1]
      } else if (state === 'replacement') {
        replacement += char + rest[j + 1]
      } else {
        flags += char + rest[j + 1]
      }
      j += 2
      continue
    }

    if (char === '/') {
      if (state === 'pattern') {
        state = 'replacement'
      } else if (state === 'replacement') {
        state = 'flags'
      } else {
        // Extra delimiter in flags - unexpected
        return null
      }
      j++
      continue
    }

    if (state === 'pattern') {
      pattern += char
    } else if (state === 'replacement') {
      replacement += char
    } else {
      flags += char
    }
    j++
  }

  // Must have found all three parts (pattern, replacement delimiter, and optional flags)
  if (state !== 'flags' || pattern === '') {
    return null
  }

  // Validate flags - only allow safe substitution flags
  // Restrict preview to the substitution flags we can reproduce exactly:
  // p prints output, numeric flags select occurrences, m/M change regex
  // anchors. Those and other sed extensions use the ordinary Bash path.
  const validFlags = /^[giI]*$/
  if (!validFlags.test(flags)) {
    return null
  }

  // Unsupported GNU/BSD sed extensions must not be shown as a successful
  // file edit. Preserve the normal Bash permission/execute path instead.
  if (/\\[{}1-9bBwW<>]/.test(pattern)) return null
  // BSD sed does not interpret GNU BRE \+ / \? / \| extensions in
  // the same way. Do not show an edit preview with different semantics.
  if (process.platform === 'darwin' && !extendedRegex && /\\[+?|]/.test(pattern)) return null
  if (/\\[^\\/&n]/.test(replacement)) return null
  if (/[\r\n]/.test(pattern) || /[\r\n]/.test(replacement)) return null

  const info = { filePath, pattern, replacement, flags, extendedRegex }
  try {
    // Validate the converted regular expression before presenting an edit.
    applySedSubstitution('', info)
  } catch {
    return null
  }
  return info
}

/**
 * Apply a sed substitution to file content
 * Returns the new content after applying the substitution
 */
export function applySedSubstitution(
  content: string,
  sedInfo: SedEditInfo,
): string {
  // Convert sed pattern to JavaScript regex
  let regexFlags = ''

  // Handle global flag
  if (sedInfo.flags.includes('g')) {
    regexFlags += 'g'
  }

  // Handle case-insensitive flag (i or I in sed)
  if (sedInfo.flags.includes('i') || sedInfo.flags.includes('I')) {
    regexFlags += 'i'
  }

  // Convert sed pattern to JavaScript regex pattern
  let jsPattern = sedInfo.pattern
    // Unescape \/ to /
    .replace(/\\\//g, '/')

  // In BRE mode (no -E flag), metacharacters have opposite escaping:
  // BRE: \+ means "one or more", + is literal
  // ERE/JS: + means "one or more", \+ is literal
  // We need to convert BRE escaping to ERE for JavaScript regex
  if (!sedInfo.extendedRegex) {
    jsPattern = jsPattern
      // Step 1: Protect literal backslashes (\\) first - in both BRE and ERE, \\ is literal backslash
      .replace(/\\\\/g, BACKSLASH_PLACEHOLDER)
      // Step 2: Replace escaped metacharacters with placeholders (these should become unescaped in JS)
      .replace(/\\\+/g, PLUS_PLACEHOLDER)
      .replace(/\\\?/g, QUESTION_PLACEHOLDER)
      .replace(/\\\|/g, PIPE_PLACEHOLDER)
      .replace(/\\\(/g, LPAREN_PLACEHOLDER)
      .replace(/\\\)/g, RPAREN_PLACEHOLDER)
      // Step 3: Escape unescaped metacharacters (these are literal in BRE)
      .replace(/\+/g, '\\+')
      .replace(/\?/g, '\\?')
      .replace(/\|/g, '\\|')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      // Step 4: Replace placeholders with their JS equivalents
      .replace(BACKSLASH_PLACEHOLDER_RE, '\\\\')
      .replace(PLUS_PLACEHOLDER_RE, '+')
      .replace(QUESTION_PLACEHOLDER_RE, '?')
      .replace(PIPE_PLACEHOLDER_RE, '|')
      .replace(LPAREN_PLACEHOLDER_RE, '(')
      .replace(RPAREN_PLACEHOLDER_RE, ')')
  }

  // Sed executes substitutions independently for every input line. Using a
  // single String.replace on the full file only changes the first line.
  // A callback also preserves literal '$' characters in sed replacements.
  const regex = new RegExp(jsPattern, regexFlags)
  const renderReplacement = (match: string): string => {
    let result = ''
    const template = sedInfo.replacement
    for (let i = 0; i < template.length; i++) {
      const ch = template.charAt(i)
      if (ch === '\\' && i + 1 < template.length) {
        const escaped = template.charAt(++i)
        result += escaped === 'n' ? '\n' : escaped
      } else {
        result += ch === '&' ? match : ch
      }
    }
    return result
  }

  if (content === '') return content
  const lines = content.split('\n')
  return lines.map((line, index) => {
    // A final newline terminates the preceding line. It does not create a
    // further empty input line for sed to process.
    if (index === lines.length - 1 && line === '') return ''
    return line.replace(regex, renderReplacement)
  }).join('\n')
}
