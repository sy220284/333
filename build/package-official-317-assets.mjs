import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { verifyOfficialEmbeddedAssets317 } from './verify-official-embedded-assets.mjs'

export function packageOfficialEmbeddedAssets317(root, dist) {
  // Verify all sources BEFORE touching the published distribution.
  const { resourceCount } = verifyOfficialEmbeddedAssets317(root)
  const manifestFile = join(root, 'build/official-embedded-assets-2.1.317.json')
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  const folder = join(dist, 'official-317')
  // Activation and rollback must stay on the destination filesystem.
  // The source checkout and an isolated release may be different mounts.
  const stage = join(dist, '.official-317-stage-' + process.pid)
  const backup = join(dist, '.official-317-backup-' + process.pid)
  if (existsSync(stage) || existsSync(backup)) {
    throw Error('Stale official 317 asset staging directory exists')
  }
  let backedUp = false
  try {
    mkdirSync(stage, { recursive: true })
    for (const record of manifest.resources) {
      const original = join(root, record.path)
      const destination = join(stage, record.path.slice(4))
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(original, destination)
      if (!lstatSync(destination).isFile()) throw Error('Staged official resource is not a regular file: ' + record.path)
      const bytes = readFileSync(destination)
      if (bytes.length !== record.bytes ||
          createHash('sha256').update(bytes).digest('hex') !== record.sha256) {
        throw Error('Staged official 317 resource changed during packaging: ' + record.path)
      }
    }
    copyFileSync(manifestFile, join(stage, 'manifest.json'))
    if (existsSync(folder)) {
      if (!lstatSync(folder).isDirectory()) throw Error('Official 317 distribution folder is invalid')
      renameSync(folder, backup)
      backedUp = true
    }
    try {
      renameSync(stage, folder)
    } catch (error) {
      if (backedUp) {
        renameSync(backup, folder)
        backedUp = false
      }
      throw error
    }
    if (backedUp) {
      rmSync(backup, { recursive: true, force: true })
      backedUp = false
    }
    // Reject untracked files in the result; the manifest is the closed inventory.
    const expected = new Set(manifest.resources.map(record => record.path.slice(4)))
    expected.add('manifest.json')
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = join(dir, entry.name)
        if (entry.isDirectory()) walk(file)
        else if (entry.isFile()) {
          const rel = relative(folder, file).split(sep).join('/')
          if (!expected.has(rel)) throw Error('Unregistered official 317 release resource: ' + rel)
        } else throw Error('Official 317 packaged resource is not a regular file: ' + file)
      }
    }
    walk(folder)
    return { resourceCount, destination: folder }
  } finally {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true })
    if (backedUp && !existsSync(folder) && existsSync(backup)) renameSync(backup, folder)
  }
}
