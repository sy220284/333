/**
 * Wire escaping for Claude Code 2.1.311-2.1.317 JSON and NDJSON output.
 * Escape DEL, C1, Unicode Cf format characters, U+2028 and U+2029.
 * JSON.stringify already handles C0 controls and invalid lone surrogates.
 */
const WIRE_UNSAFE = /[\u007f-\u009f\u2028\u2029\p{Cf}]/gu

export function escapeUnsafeJsonWireCharacters(json: string): string {
  return json.replace(WIRE_UNSAFE, character => {
    let escaped = ''
    // A supplementary format character (such as U+E0001) occupies two
    // UTF-16 units, so encode both units as surrogate-pair \uXXXX escapes.
    for (let i = 0; i < character.length; i++) {
      escaped += '\\u' + character.charCodeAt(i).toString(16).padStart(4, '0')
    }
    return escaped
  })
}
