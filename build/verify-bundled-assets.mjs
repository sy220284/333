import { createHash } from 'node:crypto'
import { readFileSync, lstatSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const release = JSON.parse(readFileSync(join(root, 'docs/upgrade/m1-evidence/target-release.json'), 'utf8'))
const target = release.target_version
if (!/^\d+\.\d+\.\d+$/.test(target)) throw Error('Invalid pinned target version')
const manifestPath = join(root, 'build', `standalone-bundled-assets-${target}.json`)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.version !== target || !Array.isArray(manifest.resources) || manifest.resources.length !== 6)
  throw Error(`Invalid standalone asset manifest for ${target}`)

const seen = new Set()
for (const record of manifest.resources) {
  const path = record.path
  if (typeof path !== 'string' || !path.startsWith('src/') ||
      isAbsolute(path) || path.split('/').some(part => part === '..' || part === '' || part === '.') ||
      path.includes('\\') || seen.has(path)) {
    throw Error(`Unsafe or duplicate bundled asset path: ${path}`)
  }
  if (typeof record.anchor !== 'string' || record.anchor.length < 10 ||
      typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256))
    throw Error(`Invalid bundled asset manifest entry: ${path}`)
  seen.add(path)
  const absolute = join(root, ...path.split('/'))
  if (!lstatSync(absolute).isFile()) throw Error(`Bundled asset must be a regular file: ${path}`)
  const bytes = readFileSync(absolute)
  if (!bytes.toString('utf8').startsWith(record.anchor))
    throw Error(`Bundled asset anchor mismatch (${target}): ${path}`)
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== record.sha256)
    throw Error(`Bundled asset checksum mismatch (${target}): ${path} expected=${record.sha256} actual=${actual}`)
}
console.log(`Verified ${seen.size} standalone bundled asset hashes against ${target}`)
