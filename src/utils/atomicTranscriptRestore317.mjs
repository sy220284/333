/**
 * Restore a remote transcript without exposing a half-written JSONL file.
 * A failed write leaves the previous transcript readable, and temporary
 * files are placed alongside the destination for same-filesystem rename.
 */
import { randomUUID } from 'node:crypto'
import { writeFile, rename, unlink } from 'node:fs/promises'

export async function replaceTranscriptAtomically(path, content) {
  const temporary = path + '.restore-' + randomUUID() + '.tmp'
  let staged = false
  try {
    await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    staged = true
    await rename(temporary, path)
    staged = false
  } finally {
    if (staged) {
      try {
        await unlink(temporary)
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
  }
}

/**
 * Stage every transcript before publishing any of them. This guarantees
 * a failed download, serialization or staging step leaves all previous
 * transcripts untouched. Each individual commit is an atomic rename.
 */
export async function replaceTranscriptBatchAtomically(entries) {
  const staged = []
  try {
    for (const entry of entries) {
      const temporary = entry.path + '.restore-' + randomUUID() + '.tmp'
      staged.push(temporary)
      await writeFile(temporary, entry.content, {
        encoding: 'utf8', mode: 0o600, flag: 'wx',
      })
    }
    for (let i = 0; i < entries.length; i++) {
      await rename(staged[i], entries[i].path)
    }
  } finally {
    for (const temporary of staged) {
      try {
        await unlink(temporary)
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
  }
}

/**
 * CCR agents may use human-readable teammate IDs with @. Enforce a strict
 * filename component: remote event identifiers cannot introduce separators,
 * drive specifiers, NULs or filesystem traversal into local transcript paths.
 */
export function assertSafeAgentTranscriptId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_@.-]{0,191}$/.test(id)) {
    throw new Error('Invalid remote agent transcript identifier')
  }
  return id
}
