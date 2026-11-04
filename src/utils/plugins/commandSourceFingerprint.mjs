import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, lstat, readlink } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

/**
 * Original 2.1.317 command-source copy-mode tree fingerprint.
 * Files: sha256.update("f " + relative + NUL + byteCount + NUL + bytes)
 * Links: sha256.update("l " + relative + NUL + targetByteCount + NUL + target)
 * Empty directories add no bytes. This hash is part of the cached version.
 */
export async function commandSourceTreeFingerprint(directory) {
  const files = []
  const symlinks = []
  const visit = async path => {
    const children = (await readdir(path)).sort()
    for (const name of children) {
      if (name === '.git') continue
      const file = join(path, name)
      const meta = await lstat(file)
      if (meta.isDirectory()) await visit(file)
      else if (meta.isFile()) files.push({ file, size: meta.size })
      else if (meta.isSymbolicLink()) symlinks.push(file)
    }
  }
  await visit(directory)
  files.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0)
  symlinks.sort()
  const hash = createHash('sha256')
  let total = 0
  for (const { file, size } of files) {
    total += size
    if (total > 200 * 1024 * 1024) throw new Error('Plugin source directory is too large')
    const path = relative(directory, file).split(sep).join('/')
    hash.update(`f ${path}\0${size}\0`, 'utf8')
    let actual = 0
    for await (const bytes of createReadStream(file)) {
      hash.update(bytes)
      actual += bytes.length
    }
    if (actual !== size) throw new Error('Plugin file changed while it was being hashed')
  }
  for (const file of symlinks) {
    const path = relative(directory, file).split(sep).join('/')
    const target = await readlink(file)
    hash.update(`l ${path}\0${Buffer.byteLength(target)}\0${target}`, 'utf8')
  }
  return hash.digest('hex')
}
