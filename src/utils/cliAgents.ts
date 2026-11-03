/**
 * Parse the 2.1.310 public CLI --agents input before loading agents.
 * Official evidence: chunk-zcdwnz6s.js:13-34 and chunk-6d8swme1.js:1565-1582.
 * Inline JSON and JSON files are both supported; errors are surfaced to the caller.
 */
import { open, realpath, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

export const MAX_AGENTS_JSON_BYTES = 268_435_456

function isInlineJson(input: string): boolean {
  const trimmed = input.trimStart()
  if (trimmed.startsWith('{')) return true
  try {
    return JSON.parse(trimmed) !== null
  } catch {
    return false
  }
}

/** Returns validated JSON syntax; agent field validation remains the Agent schema's job. */
export async function loadCliAgentsConfiguration(input: string): Promise<{
  configuration: unknown
  filePath?: string
}> {
  let json = input
  let filePath: string | undefined
  if (!isInlineJson(input)) {
    filePath = resolve(input)
    try {
      const handle = await open(filePath, 'r')
      try {
        const before = await handle.stat()
        if (!before.isFile()) {
          throw new Error('Only regular files can be read as --agents configuration')
        }
        if (before.nlink > 1) {
          const error = new Error('Multiple hard links') as NodeJS.ErrnoException
          error.code = 'ERR_MULTIPLE_LINKS'
          throw error
        }
        if (before.size > MAX_AGENTS_JSON_BYTES) {
          const error = new Error('File too large') as NodeJS.ErrnoException
          error.code = 'ERR_FILE_TOO_LARGE'
          throw error
        }
        const resolved = await realpath(filePath)
        const after = await stat(resolved)
        if (before.dev !== after.dev || before.ino !== after.ino) {
          throw new Error(`Error: --agents file changed while it was read: ${filePath}`)
        }
        json = await handle.readFile({ encoding: 'utf8' })
        if (Buffer.byteLength(json, 'utf8') > MAX_AGENTS_JSON_BYTES) {
          const error = new Error('File too large') as NodeJS.ErrnoException
          error.code = 'ERR_FILE_TOO_LARGE'
          throw error
        }
      } finally {
        await handle.close()
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        throw new Error(`Error: --agents file not found: ${filePath} (a value that is not a JSON object is read as a file path)`)
      }
      if (code === 'ERR_FILE_TOO_LARGE') {
        throw new Error(`Error: --agents file is larger than ${MAX_AGENTS_JSON_BYTES} bytes: ${filePath}`)
      }
      if (code === 'ERR_MULTIPLE_LINKS') {
        throw new Error(`Error: --agents file has more than one hard link: ${filePath} (its other names are not write-protected; pass a file with one name)`)
      }
      if (error instanceof Error && error.message.startsWith('Error: --agents file changed')) {
        throw error
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Error reading --agents file ${filePath}: ${message}`)
    }
  }
  try {
    return { configuration: JSON.parse(json), ...(filePath ? { filePath } : {}) }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Error: Invalid --agents configuration:\ninvalid JSON: ${reason}${filePath ? `\n(read from ${filePath})` : ''}`)
  }
}
