import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// Verify every committed Claude API resource against the active official
// release manifest. Keep historical manifests as immutable provenance.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const base = join(root, 'src/skills/bundled/claude-api')
const target = JSON.parse(readFileSync(join(root, 'docs/upgrade/m1-evidence/target-release.json'), 'utf8')).target_version
const manifest = JSON.parse(readFileSync(join(root, `build/claude-api-${target}-manifest.json`), 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const sourceFlag = process.argv.indexOf('--source-dir')
const sourceDir = sourceFlag < 0 ? undefined : resolve(process.argv[sourceFlag + 1] ?? '')
const nativeFlag = process.argv.indexOf('--official-binary')
const nativePath = nativeFlag < 0 ? undefined : process.argv[nativeFlag + 1]
if (nativeFlag >= 0 && !nativePath) throw Error('--official-binary requires a file path')
const nativeBytes = nativePath ? readFileSync(resolve(nativePath)) : undefined
if (nativeBytes && hash(nativeBytes) !== manifest.native_executable_sha256)
  throw Error('The official native binary does not match the 2.1.317 manifest')
if (sourceFlag >= 0 && !process.argv[sourceFlag + 1]) throw Error('--source-dir requires a path')
if (manifest.version !== target || !Array.isArray(manifest.files)) throw Error('Invalid target resource manifest')

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path.slice(base.length + 1).split(sep).join('/')]
  })
}
const expected = new Set()
for (const entry of manifest.files) {
  const storedPath = entry.stored_path ?? entry.path
  if (typeof entry.path !== 'string' || typeof storedPath !== 'string' || storedPath.startsWith('/') || storedPath.split('/').includes('..') || expected.has(storedPath)) {
    throw Error(`Invalid or duplicate skill resource path: ${entry.path}`)
  }
  expected.add(storedPath)
  const content = readFileSync(join(base, storedPath))
  if (hash(content) !== entry.sha256) throw Error(`${target} skill resource changed: ${entry.path}`)
  if (sourceDir) {
    const source = entry.source.startsWith('elf:')
      ? (() => {
          if (!nativeBytes) throw Error('--official-binary required for ELF resource provenance')
          const [offset, count] = entry.source.slice(4).split(':').map(Number)
          if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(count) || offset < 0 || count < 0 || offset + count > nativeBytes.length)
            throw Error(`Invalid native source range: ${entry.source}`)
          return nativeBytes.subarray(offset, offset + count)
        })()
      : readFileSync(join(sourceDir, entry.source))
    if (hash(source) !== entry.source_sha256) throw Error(`Source resource changed: ${entry.source}`)
    const decoded = entry.source_encoding === 'utf-16le' ? Buffer.from(source.toString('utf16le'), 'utf8') : source
    if (!decoded.equals(content)) throw Error(`Source and committed resource differ: ${entry.path}`)
  }
}
const actual = walk(base)
const extras = actual.filter(path => !expected.has(path))
if (actual.length !== expected.size || extras.length) throw Error(`Unexpected Claude API resources: ${extras.join(', ')}`)
if (sourceDir) {
  const module = readFileSync(join(sourceDir, manifest.mapping_module))
  if (hash(module) !== manifest.mapping_module_sha256) throw Error('Target resource mapping module changed')
}
console.log(`Verified ${expected.size} committed Claude API ${target} resources${sourceDir ? ' against the decompiled source' : ''}`)
