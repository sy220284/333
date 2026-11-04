/**
 * Restore foreground and agent JSONL as a coordinated file transaction.
 * Stage all files, copy previous destinations, publish with same-directory
 * renames, and roll back every published file if a later rename fails.
 * Cross-process crash atomicity needs a durable journal; this guarantees
 * recovery from ordinary I/O errors without discarding the prior transcript.
 */
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { transcriptDestinationKey, withTranscriptDestinationLocks } from './transcriptDestinationLocks317.ts'
import {
  copyFile as copyFileNative,
  rename as renameNative,
  unlink as unlinkNative,
  writeFile as writeFileNative,
} from 'node:fs/promises'

export type TranscriptRestoreIO317 = {
  copyFile: (source: string, destination: string, mode?: number) => Promise<void>
  rename: (source: string, destination: string) => Promise<void>
  unlink: (path: string) => Promise<void>
  writeFile: (path: string, content: string, options: { encoding: 'utf8'; mode: number; flag: 'wx' }) => Promise<void>
}
export type TranscriptRestoreEntry317 = { path: string; content: string }

const nativeIO = {
  copyFile: copyFileNative,
  rename: renameNative,
  unlink: unlinkNative,
  writeFile: writeFileNative,
}

function validateEntries(entries: ReadonlyArray<TranscriptRestoreEntry317>): void {
  const names = new Set()
  for (const entry of entries) {
    if (typeof entry.path !== 'string' || !entry.path || typeof entry.content !== 'string') {
      throw new TypeError('Transcript replacement requires a file path and JSONL content')
    }
    const destination = transcriptDestinationKey(entry.path)
    if (names.has(destination)) {
      throw new Error('Duplicate transcript restoration destination: ' + entry.path)
    }
    names.add(destination)
  }
}

async function removeTemp(io: TranscriptRestoreIO317, path: string, failures: unknown[]): Promise<void> {
  try {
    await io.unlink(path)
  } catch (error) {
    if (error?.code !== 'ENOENT') failures.push(error)
  }
}

export async function replaceTranscriptBatchAtomically(entries: ReadonlyArray<TranscriptRestoreEntry317>, io: TranscriptRestoreIO317 = nativeIO): Promise<void> {
  validateEntries(entries)
  if (entries.length === 0) return
  return withTranscriptDestinationLocks(
    entries.map(entry => entry.path),
    () => publishTranscriptBatchAtomically(entries, io),
  )
}

async function publishTranscriptBatchAtomically(entries: ReadonlyArray<TranscriptRestoreEntry317>, io: TranscriptRestoreIO317): Promise<void> {
  const token = randomUUID()
  const records = entries.map(({ path, content }, i) => ({
    path,
    content,
    staged: path + '.restore-' + token + '-' + i + '.tmp',
    backup: path + '.restore-' + token + '-' + i + '.bak',
    hadOriginal: false,
    published: false,
  }))
  let failure
  let rollbackFailed = false
  try {
    // All writes and backups finish before the first existing file changes.
    for (const record of records) {
      await io.writeFile(record.staged, record.content, {
        encoding: 'utf8', mode: 0o600, flag: 'wx',
      })
    }
    for (const record of records) {
      try {
        await io.copyFile(record.path, record.backup, constants.COPYFILE_EXCL)
        record.hadOriginal = true
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
    for (const record of records) {
      await io.rename(record.staged, record.path)
      record.published = true
    }
  } catch (error) {
    const rollbackErrors = []
    for (const record of records.slice().reverse()) {
      if (!record.published) continue
      try {
        if (record.hadOriginal) {
          await io.rename(record.backup, record.path)
        } else {
          await io.unlink(record.path)
        }
      } catch (rollbackError) {
        rollbackFailed = true
        rollbackErrors.push(new Error(
          'Failed to roll back transcript: ' + record.path,
          { cause: rollbackError },
        ))
      }
    }
    failure = rollbackErrors.length
      ? new AggregateError(
        [error, ...rollbackErrors],
        'Transcript publish failed and rollback was incomplete',
      )
      : error
  }
  const cleanupErrors: unknown[] = []
  for (const record of records) {
    await removeTemp(io, record.staged, cleanupErrors)
    // Preserve recovery copies if the rollback itself was unsuccessful.
    if (!rollbackFailed) await removeTemp(io, record.backup, cleanupErrors)
  }
  if (cleanupErrors.length) {
    throw new AggregateError(
      failure ? [failure, ...cleanupErrors] : cleanupErrors,
      'Transcript restoration temporary cleanup failed',
    )
  }
  if (failure) throw failure
}

export async function replaceTranscriptAtomically(path: string, content: string, io: TranscriptRestoreIO317 = nativeIO): Promise<void> {
  await replaceTranscriptBatchAtomically([{ path, content }], io)
}

export function assertSafeAgentTranscriptId(id: string) : string {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_@.-]{0,191}$/.test(id)) {
    throw new Error('Invalid remote agent transcript identifier')
  }
  return id
}
