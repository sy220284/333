import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RELEASE = '2.1.317'
const BINARY_SHA = 'eb224419e344575faa4a1f39b290b649425a10cd5ee2ef1d003480cd9ae57eb0'
const COUNT = 101
const PREFIXES = [
  'src/skills/bundled/',
  'src/constants/official317/',
  'src/types/official317/',
]

export function verifyOfficialEmbeddedAssets317(projectRoot = ROOT) {
  const root = realpathSync(projectRoot)
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  if (version !== RELEASE) throw Error('Official resource verifier must match the release version: ' + version)
  const manifest = JSON.parse(readFileSync(join(root, 'build/official-embedded-assets-' + RELEASE + '.json'), 'utf8'))
  if (manifest.version !== RELEASE || manifest.source_binary_sha256 !== BINARY_SHA ||
      !Array.isArray(manifest.resources) || manifest.resources.length !== COUNT) {
    throw Error('Official 2.1.317 embedded-resource manifest is invalid or incomplete')
  }
  let previous = '', totalBytes = 0
  for (const item of manifest.resources) {
    const path = item?.path
    if (typeof path !== 'string' || !PREFIXES.some(prefix => path.startsWith(prefix)) ||
        isAbsolute(path) || path.includes('\\') ||
        path.split('/').some(part => !part || part === '.' || part === '..') ||
        (previous && path <= previous)) {
      throw Error('Invalid, unordered or repeated official resource path: ' + path)
    }
    previous = path
    if (!Number.isSafeInteger(item.bytes) || item.bytes < 0 ||
        typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) {
      throw Error('Invalid official resource checksum metadata: ' + path)
    }
    const filename = join(root, path)
    if (!lstatSync(filename).isFile()) throw Error('Official resource must be a regular file: ' + path)
    const canonical = realpathSync(filename)
    const rel = relative(root, canonical)
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
      throw Error('Official resource escaped the repository: ' + path)
    }
    const bytes = readFileSync(filename)
    const actual = createHash('sha256').update(bytes).digest('hex')
    if (bytes.length !== item.bytes || actual !== item.sha256) {
      throw Error('Official 2.1.317 resource bytes differ from the pinned original: ' + path)
    }
    totalBytes += bytes.length
  }
  return { release: RELEASE, resourceCount: COUNT, bytes: totalBytes, verified: true }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(verifyOfficialEmbeddedAssets317()))
}
