/**
 * Local-only 333 diagnostic event journal. Events are metadata-only:
 * no prompts, source code, filenames, credentials, or raw API responses.
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { registerCleanup } from '../../utils/cleanupRegistry.js'
const DIAGNOSTICS_DIR = join(homedir(), '.333', 'diagnostics')
const JOURNAL = join(DIAGNOSTICS_DIR, 'events.ndjson')
const ARCHIVE = join(DIAGNOSTICS_DIR, 'events.previous.ndjson')
const MAX_BYTES = 4 * 1024 * 1024
const MAX_ATTRIBUTE_KEYS = 40
let queue: Promise<void> = Promise.resolve()
let failure: Error | null = null
function safeAttributes(raw: Record<string, unknown>): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {}
  for (const [key, value] of Object.entries(raw).slice(0, MAX_ATTRIBUTE_KEYS)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(key)) continue
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) out[key] = value
  }
  return out
}
async function appendEvent(event: string, attributes: Record<string, number | boolean>): Promise<void> {
  await fs.mkdir(DIAGNOSTICS_DIR, { recursive: true, mode: 0o700 })
  try {
    const stat = await fs.stat(JOURNAL)
    if (stat.size > MAX_BYTES) {
      await fs.rm(ARCHIVE, { force: true })
      await fs.rename(JOURNAL, ARCHIVE)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  await fs.appendFile(JOURNAL, JSON.stringify({
    time: new Date().toISOString(), event, attributes,
  }) + '\n', { encoding: 'utf8', mode: 0o600 })
}
export function recordLocalEvent(event: string, raw: Record<string, unknown> = {}): Promise<void> {
  if (!/^[a-zA-Z][a-zA-Z0-9_.:-]{0,100}$/.test(event)) {
    return Promise.reject(new Error('Invalid local diagnostic event name'))
  }
  const attributes = safeAttributes(raw)
  // A rejected write is reported and kept visible to the next caller;
  // serialization continues so one disk fault does not permanently block writes.
  const next = queue.then(() => appendEvent(event, attributes))
  queue = next.catch(error => {
    failure = error as Error
    process.stderr.write(`[333 diagnostics] ${String(error)}\n`)
  })
  return next
}
export async function flushLocalDiagnostics(): Promise<void> {
  await queue
  if (failure) {
    const error = failure
    failure = null
    throw error
  }
}
registerCleanup(flushLocalDiagnostics)
