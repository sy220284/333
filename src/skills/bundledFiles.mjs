import { constants } from 'node:fs'
import { mkdir, mkdtemp, open, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, sep } from 'node:path'

const safeFlags = process.platform === 'win32'
  ? 'wx'
  : constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0)

async function settleAll(promises) {
  const results = await Promise.allSettled(promises)
  const failure = results.find(result => result.status === 'rejected')
  if (failure) throw failure.reason
}

/** Write to a private staging directory and publish only a complete bundle. */
export async function extractBundleAtomically(dir, files) {
  const parent = dirname(dir)
  await mkdir(parent, { recursive: true, mode: 0o700 })
  const temporary = await mkdtemp(join(parent, '.extract-'))
  try {
    const groups = new Map()
    for (const [path, content] of Object.entries(files)) {
      const normalized = normalize(path)
      if (isAbsolute(normalized) || normalized.split(sep).includes('..') || normalized.split('/').includes('..')) {
        throw new Error(`bundled skill file path escapes skill dir: ${path}`)
      }
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
    await rename(temporary, dir)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
