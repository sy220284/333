import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, readFile, readdir, mkdir, mkdtemp, open, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, sep } from 'node:path'
import lockfile from 'proper-lockfile'

const safeFlags = process.platform === 'win32'
  ? 'wx'
  : constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0)

async function settleAll(promises) {
  const results = await Promise.allSettled(promises)
  const failure = results.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
}

async function isExactBundle(dir, expectedFiles) {
  let root
  try { root = await lstat(dir) }
  catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
  if (!root.isDirectory()) return false
  const actual = new Map()
  async function walk(base, prefix = '') {
    for (const entry of await readdir(base, { withFileTypes: true })) {
      const relative = prefix ? join(prefix, entry.name) : entry.name
      const full = join(base, entry.name)
      if (entry.isDirectory()) await walk(full, relative)
      else if (entry.isFile()) actual.set(relative, full)
      else throw new Error(`Unexpected non-file entry in bundled skill directory: ${relative}`)
    }
  }
  await walk(dir)
  if (actual.size !== expectedFiles.size) return false
  for (const [relative, content] of expectedFiles) {
    const full = actual.get(relative)
    if (!full || await readFile(full, 'utf8') !== content) return false
  }
  return true
}

/** Stage the entire bundle and publish it only once all files are written.
 * A repeat invocation is idempotent; a changed bundle is replaced via a
 * rollback-capable directory rename rather than silently missing its files.
 */
export async function extractBundleAtomically(dir: string, files: Record<string, string>) : Promise<void> {
  const parent = dirname(dir)
  await mkdir(parent, { recursive: true, mode: 0o700 })
  const temporary = await mkdtemp(join(parent, '.extract-'))
  const expected = new Map()
  try {
    const groups = new Map()
    for (const [path, content] of Object.entries(files)) {
      const normalized = normalize(path)
      if (!normalized || normalized === '.' || isAbsolute(normalized) ||
          normalized.split(sep).includes('..') || normalized.split('/').includes('..')) {
        throw new Error(`bundled skill file path escapes skill dir: ${path}`)
      }
      if (expected.has(normalized)) throw new Error(`Duplicate bundled skill path: ${path}`)
      expected.set(normalized, content)
      const target = join(temporary, normalized)
      const directory = dirname(target)
      const entries = groups.get(directory) ?? []
      entries.push([target, content])
      groups.set(directory, entries)
    }
    await settleAll([...groups].map(async ([directory, entries]) => {
      await mkdir(directory, { recursive: true, mode: 0o700 })
      await settleAll(entries.map(async ([path, content]) => {
        const file = await open(path, safeFlags, 0o600)
        try { await file.writeFile(content, 'utf8') } finally { await file.close() }
      }))
    }))
    // Multiple CLI processes can lazily extract the same bundled skill.
    // Lock the shared root across processes (including Windows) while checking
    // and publishing; the library also recovers abandoned locks after crashes.
    const releaseLock = await lockfile.lock(parent, {
      stale: 30_000, update: 10_000,
      retries: { retries: 100, factor: 1.1, minTimeout: 20, maxTimeout: 150 },
    })
    try {
    if (await isExactBundle(dir, expected)) return
    const backup = join(parent, `.previous-${randomUUID()}`)
    let movedOld = false
    let published = false
    try {
      try { await rename(dir, backup); movedOld = true }
      catch (error) { if (error.code !== 'ENOENT') throw error }
      try { await rename(temporary, dir) }
      catch (error) {
        // Another process may have published the same bundle concurrently.
        if (!movedOld && await isExactBundle(dir, expected)) return
        throw error
      }
      published = true
      if (movedOld) await rm(backup, { recursive: true, force: true })
    } catch (error) {
      if (movedOld && !published) await rename(backup, dir)
      throw error
    }
    } finally {
      await releaseLock()
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
