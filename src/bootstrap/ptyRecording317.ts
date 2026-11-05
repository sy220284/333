import { createWriteStream, type WriteStream } from 'node:fs'

/**
 * Original 2.1.317 chunk-2bqkbqq9.js pe().
 * Binary format: uint32be(cols), uint32be(rows), then each PTY chunk as
 * uint32be(elapsed microseconds) + uint32be(length) + original bytes.
 * Time wraps at 2^32 microseconds just as in the upstream.
 */
export type PtyRecording317 = {
  write(bytes: Buffer): void
  close(): void
}

export function createPtyRecording317(
  path: string | undefined, cols: number, rows: number,
  clock: () => bigint = () => process.hrtime.bigint(),
): PtyRecording317 | undefined {
  if (!path) return undefined
  const started = clock()
  let stream: WriteStream
  try {
    stream = createWriteStream(path, { flags: 'w' })
  } catch {
    // The original treats an unavailable optional recording destination as
    // a disabled recorder, while the terminal and session remain functional.
    return undefined
  }
  let failed = false
  let closed = false
  stream.on('error', () => {
    failed = true
    stream.destroy()
  })
  const header = Buffer.allocUnsafe(8)
  header.writeUInt32BE(cols >>> 0, 0)
  header.writeUInt32BE(rows >>> 0, 4)
  stream.write(header)
  return {
    write(bytes: Buffer): void {
      if (failed || closed) return
      const packet = Buffer.allocUnsafe(8 + bytes.length)
      const elapsedMicroseconds = Number((clock() - started) / 1000n)
      packet.writeUInt32BE(elapsedMicroseconds >>> 0, 0)
      packet.writeUInt32BE(bytes.length >>> 0, 4)
      bytes.copy(packet, 8)
      stream.write(packet)
    },
    close(): void {
      if (closed) return
      closed = true
      if (!failed) stream.end()
    },
  }
}
