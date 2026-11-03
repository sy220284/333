import { open } from 'node:fs/promises'

/**
 * Read through a single file descriptor, with a strict size limit.
 * This eliminates pathname stat/read races and memory spikes when a file grows.
 */
export async function readUtf8FileBounded(filename: string, maxBytes: number): Promise<string | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('maxBytes must be a nonnegative safe integer')
  const handle = await open(filename, 'r')
  try {
    const chunks: Buffer[] = []
    let position = 0
    while (position <= maxBytes) {
      const length = Math.min(256 * 1024, maxBytes + 1 - position)
      if (length === 0) break
      const buffer = Buffer.allocUnsafe(length)
      const { bytesRead } = await handle.read(buffer, 0, length, position)
      if (bytesRead === 0) break
      position += bytesRead
      if (position > maxBytes) return null
      chunks.push(buffer.subarray(0, bytesRead))
    }
    return Buffer.concat(chunks, position).toString('utf8')
  } finally {
    await handle.close()
  }
}
