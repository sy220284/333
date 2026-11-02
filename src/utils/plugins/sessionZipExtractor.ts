import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'
import { unzipSync } from 'fflate'

const MAX_ZIP_BYTES = 64 * 1024 * 1024
const MAX_FILE_BYTES = 128 * 1024 * 1024
const MAX_TOTAL_BYTES = 512 * 1024 * 1024
const MAX_ENTRIES = 10000
const MAX_RATIO = 50

function validateEntry(name: string): void {
  const parts = name.replaceAll('\\', '/').split('/')
  if (!name || name.includes('\\') || name.includes('\0') ||
      name.startsWith('/') || name.startsWith('//') ||
      /^[A-Za-z]:/.test(name) || parts.includes('..') ||
      parts.some(part => part === '.' || part === '') && !name.endsWith('/') ||
      posix.normalize(name).startsWith('../')) {
    throw new Error(`Unsafe ZIP path traversal: ${JSON.stringify(name)}`)
  }
}

/**
 * Small, self-contained ZIP extraction boundary for session plugins.
 * Loading the full plugin cache at startup also loads editor/UI native modules,
 * which are unrelated to decoding an explicit session ZIP.
 *
 * Do not follow archive symlinks: entries become regular files only. Apply
 * executable bits to hook scripts when the archive's central directory records
 * a regular Unix file, as in the existing plugin cache extractor.
 */
export async function extractSessionZip(zipPath: string, targetDir: string): Promise<void> {
  const compressed = await readFile(zipPath)
  if (compressed.byteLength > MAX_ZIP_BYTES) throw new Error('Plugin ZIP exceeds 64 MiB')
  let entries = 0
  let total = 0
  const files = unzipSync(compressed, {
    filter: entry => {
      validateEntry(entry.name)
      if (++entries > MAX_ENTRIES) throw new Error('Plugin ZIP has too many entries')
      const bytes = entry.originalSize ?? 0
      if (bytes > MAX_FILE_BYTES) throw new Error('Plugin ZIP file is too large')
      total += bytes
      if (total > MAX_TOTAL_BYTES || total > compressed.byteLength * MAX_RATIO) {
        throw new Error('Plugin ZIP exceeds uncompressed size or expansion limits')
      }
      return true
    },
  })
  // fflate may report unknown original sizes on some valid archives. Verify
  // the actual decoded byte count before writing anything to disk.
  let decodedBytes = 0
  for (const [name, bytes] of Object.entries(files)) {
    validateEntry(name)
    decodedBytes += bytes.byteLength
    if (bytes.byteLength > MAX_FILE_BYTES || decodedBytes > MAX_TOTAL_BYTES ||
        decodedBytes > compressed.byteLength * MAX_RATIO) {
      throw new Error('Plugin ZIP decompressed data exceeds safety limits')
    }
  }
  const buf = Buffer.from(compressed)
  const modes = new Map<string, number>()
  const lastEocd = Math.max(0, buf.length - 22 - 65535)
  for (let i = buf.length - 22; i >= lastEocd; i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue
    let offset = buf.readUInt32LE(i + 16)
    const count = buf.readUInt16LE(i + 10)
    for (let n = 0; n < count; n++) {
      if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) break
      const nameLen = buf.readUInt16LE(offset + 28)
      const extraLen = buf.readUInt16LE(offset + 30)
      const commentLen = buf.readUInt16LE(offset + 32)
      const end = offset + 46 + nameLen + extraLen + commentLen
      if (end > buf.length) throw new Error('Corrupt ZIP central directory')
      const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen)
      validateEntry(name)
      if (buf.readUInt16LE(offset + 4) >> 8 === 3) {
        const mode = (buf.readUInt32LE(offset + 38) >>> 16) & 0xffff
        if ((mode & 0o170000) === 0o120000) throw new Error('ZIP symlink entries are forbidden')
        if ((mode & 0o170000) === 0o100000) modes.set(name, mode & 0o777)
      }
      offset = end
    }
    break
  }
  await mkdir(targetDir, { recursive: true })
  for (const [name, bytes] of Object.entries(files)) {
    const dest = join(targetDir, name)
    if (name.endsWith('/')) {
      await mkdir(dest, { recursive: true })
      continue
    }
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, bytes, { flag: 'wx' })
    const mode = modes.get(name)
    if (mode && (mode & 0o111)) await chmod(dest, mode)
  }
}
