/**
 * Serialize edits to the same notebook in this process, like the file
 * transaction lock around NotebookEdit in 2.1.310.
 *
 * A failure releases the lock; different notebook paths remain independent.
 */
import { normalize } from 'node:path'
import { getFsImplementation } from './fsOperations.js'

const pendingWrites = new Map<string, Promise<void>>()

/**
 * An editable notebook can be addressed through a symlinked directory or
 * file. Resolve existing paths to one lock key so alias writes serialize.
 * Missing files retain their normalized path; validation reports ENOENT.
 */
function getNotebookLockKey(path: string): string {
  try {
    return getFsImplementation().realpathSync(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return normalize(path)
    }
    throw error
  }
}

export async function withNotebookFileLock<T>(
  path: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = getNotebookLockKey(path)
  const preceding = pendingWrites.get(key) ?? Promise.resolve()
  let unlock: () => void = () => {}
  const held = new Promise<void>(resolve => {
    unlock = resolve
  })
  const tail = preceding.then(() => held)
  pendingWrites.set(key, tail)

  await preceding
  try {
    return await operation()
  } finally {
    unlock()
    if (pendingWrites.get(key) === tail) pendingWrites.delete(key)
  }
}
