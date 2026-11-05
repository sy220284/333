import { jsonStringify } from '../utils/slowOperations.js'
import { escapeUnsafeJsonWireCharacters } from './jsonWireEscaping.ts'

/**
 * JSON and stream-json share the exact Claude Code 2.1.317 wire protocol:
 * escape DEL, C1 controls, format characters (Cf), U+2028 and U+2029 while
 * preserving the original Unicode content after JSON.parse.
 */
export function ndjsonSafeStringify(value: unknown): string {
  return escapeUnsafeJsonWireCharacters(jsonStringify(value))
}
