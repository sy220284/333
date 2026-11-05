import type { UserConfigSchema, UserConfigValues } from './mcpbHandler.js'
import { validateUserConfig } from './mcpbHandler.js'

const MAX_INPUT_BYTES = 256 * 1024
const MAX_VALUE_BYTES = 64 * 1024

export class PluginCliConfigError extends Error {
  constructor(message: string, public readonly option?: string) {
    super(message)
    this.name = 'PluginCliConfigError'
  }
}

/** The 2.1.317 --values-stdin contract accepts a JSON object of strings. */
export function parsePluginConfigJson(text: string): Record<string, string> {
  if (Buffer.byteLength(text, 'utf8') > MAX_INPUT_BYTES) {
    throw new PluginCliConfigError('The input on stdin is over the 256 KB limit.')
  }
  let input: unknown
  try { input = JSON.parse(text) } catch {
    throw new PluginCliConfigError("The input on stdin isn't a JSON object of strings.")
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PluginCliConfigError("The input on stdin isn't a JSON object of strings.")
  }
  const entries = Object.entries(input)
  if (entries.some(([, value]) => typeof value !== 'string')) {
    throw new PluginCliConfigError("The input on stdin isn't a JSON object of strings.")
  }
  return Object.fromEntries(entries) as Record<string, string>
}

export function validatePluginCliValues(
  input: Record<string, string>,
  schema: UserConfigSchema,
  saved: UserConfigValues,
): UserConfigValues {
  const known = Object.keys(schema)
  const validated: UserConfigValues = {}
  for (const [key, raw] of Object.entries(input)) {
    if (!Object.hasOwn(schema, key)) {
      throw new PluginCliConfigError(
        `This plugin has no option "${key}". Known options: ${known.join(', ')}.`,
        key,
      )
    }
    if (Buffer.byteLength(raw, 'utf8') > MAX_VALUE_BYTES) {
      throw new PluginCliConfigError(`${key} is too long (over 64 KB).`, key)
    }
    if (/[\r\n]/.test(raw)) {
      throw new PluginCliConfigError(`${key} must be a single line.`, key)
    }
    const field = schema[key]
    const value = raw.trim()
    if (!value && field.required) {
      if (field.sensitive && saved[key] !== undefined && saved[key] !== '') continue
      throw new PluginCliConfigError(`${field.title || key} is required but not provided`, key)
    }
    let normalized: UserConfigValues[string] = value
    if (value && field.type === 'boolean') {
      if (/^(true|1|yes|on)$/i.test(value)) normalized = true
      else if (/^(false|0|no|off)$/i.test(value)) normalized = false
      else throw new PluginCliConfigError(`${field.title || key} must be true or false (or 1/0, yes/no, on/off).`, key)
    } else if (value && field.type === 'number') {
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) {
        throw new PluginCliConfigError(`${field.title || key} must be a valid number.`, key)
      }
      normalized = parsed
    }
    const result = validateUserConfig({ [key]: normalized }, { [key]: field })
    if (!result.valid) throw new PluginCliConfigError(result.errors.join('; '), key)
    validated[key] = normalized
  }
  return validated
}

export async function readPluginConfigStdin(stream: AsyncIterable<Buffer | string>): Promise<Record<string, string>> {
  let text = ''
  let bytes = 0
  for await (const chunk of stream) {
    bytes += Buffer.byteLength(chunk)
    if (bytes > MAX_INPUT_BYTES) throw new PluginCliConfigError('The input on stdin is over the 256 KB limit.')
    text += chunk.toString()
  }
  return parsePluginConfigJson(text)
}
