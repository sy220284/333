import { jsonStringify } from '../utils/slowOperations.js'

// Claude Code 2.1.311+ JSON/stream-json wire contract (verified against the
// 2.1.317 Linux x64 binary): DEL, C1 controls, Unicode format characters
// (General_Category=Cf) and JS line separators must be escaped. Unescaped
// characters can be swallowed, visually hidden, or split into separate lines
// by a host consuming the structured protocol.
//
// A supplementary-plane Cf character occupies two UTF-16 code units and
// needs two \\uXXXX escapes. JSON.stringify already handles C0 controls and
// lone surrogates correctly; preserving those escapes keeps the payload
// byte-safe while JSON.parse recovers the exact original string.
const WIRE_UNSAFE = /[\u007f-\u009f\u2028\u2029\p{Cf}]/gu

function escapeForWire(json: string): string {
  return json.replace(WIRE_UNSAFE, character => {
    let escaped = ''
    for (let i = 0; i < character.length; i++) {
      escaped += '\\u' + character.charCodeAt(i).toString(16).padStart(4, '0')
    }
    return escaped
  })
}

/**
 * JSON output serializer for CLI JSON and NDJSON streams. It preserves the
 * object and string content exactly after JSON.parse while ensuring one line
 * of output never contains hidden protocol-control or format characters.
 */
export function ndjsonSafeStringify(value: unknown): string {
  return escapeForWire(jsonStringify(value))
}
