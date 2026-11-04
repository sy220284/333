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
