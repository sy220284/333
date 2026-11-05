/**
 * Serialize overlapping session restores inside this process.
 *
 * Every destination is reserved in canonical sorted order before work begins,
 * preventing two foreground/agent restore transactions from interleaving
 * backup and publish steps. Different sessions can restore concurrently.
 */
import { resolve } from 'node:path'

const pending = new Map()

/** A shared identity for duplicate detection and locking on each platform. */
export function transcriptDestinationKey(path: string) : string {
  const absolute = resolve(path)
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}

export async function withTranscriptDestinationLocks(paths: string[], operation: () => Promise<void>) : Promise<void> {
  const keys = [...new Set(paths.map(transcriptDestinationKey))].sort()
  const acquired = []
  try {
    for (const key of keys) {
      const predecessor = pending.get(key)
      let unlock
      const current = new Promise(resolveLock => { unlock = resolveLock })
      pending.set(key, current)
      if (predecessor) await predecessor
      acquired.push({ key, current, unlock })
    }
    return await operation()
  } finally {
    for (const { key, current, unlock } of acquired.reverse()) {
      if (pending.get(key) === current) pending.delete(key)
      unlock()
    }
  }
}
