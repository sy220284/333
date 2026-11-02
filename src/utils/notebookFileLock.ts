/**
 * Serialize edits to the same notebook in this process, like the file
 * transaction lock around NotebookEdit in 2.1.310.
 *
 * A failure releases the lock; different notebook paths remain independent.
 */
const pendingWrites = new Map<string, Promise<void>>()

export async function withNotebookFileLock<T>(
  path: string,
  operation: () => Promise<T>,
): Promise<T> {
  const preceding = pendingWrites.get(path) ?? Promise.resolve()
  let unlock: () => void = () => {}
  const held = new Promise<void>(resolve => {
    unlock = resolve
  })
  const tail = preceding.then(() => held)
  pendingWrites.set(path, tail)

  await preceding
  try {
    return await operation()
  } finally {
    unlock()
    if (pendingWrites.get(path) === tail) pendingWrites.delete(path)
  }
}
