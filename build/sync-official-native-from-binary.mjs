import { createHash } from 'node:crypto'
import { createReadStream, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// C19-T01: restore native addons straight from the verified official x64,
// using offsets recorded from the independently verified Bun module table.
// Usage: node build/sync-official-native-from-binary.mjs --binary FILE --vendor-root DIR [--sync]
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
function required(flag) {
  const i = args.indexOf(flag)
  if (i < 0 || !args[i + 1] || args[i + 1].startsWith('--'))
    throw new Error('Missing ' + flag)
  return resolve(args[i + 1])
}
const binary = required('--binary')
const vendor = required('--vendor-root')
const sync = args.includes('--sync')
const manifest = JSON.parse(readFileSync(join(root, 'build/official-native-317.json'), 'utf8'))
const release = JSON.parse(readFileSync(join(root, 'docs/upgrade/m1-evidence/target-release.json'), 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const sha256File = async path => {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  return digest.digest('hex')
}
if (manifest.version !== release.target_version || manifest.platform !== 'x64-linux' ||
    manifest.binary_sha256 !== release.verified_x64_sha256)
  throw new Error('Native module catalog differs from target release')
if (await sha256File(binary) !== release.verified_x64_sha256)
  throw new Error('Official x64 executable SHA-256 mismatch')
const fd = openSync(binary, 'r')
const checked = []
let bad = 0
try {
  for (const { name, offset, size, sha256 } of manifest.modules) {
    if (!/^[a-z0-9-]+[.]node$/.test(name) || !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(size) || offset < 0 || size <= 0 ||
        !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid native module record')
    const bytes = Buffer.allocUnsafe(size)
    let count = 0
    while (count < size) {
      const n = readSync(fd, bytes, count, size - count, offset + count)
      if (!n) throw new Error('Native module record exceeds executable: ' + name)
      count += n
    }
    if (hash(bytes) !== sha256) throw new Error('Original native module digest mismatch: ' + name)
    const target = join(vendor, name.slice(0, -5), manifest.platform, name)
    const previous = existsSync(target) ? hash(readFileSync(target)) : null
    if (previous !== sha256 && sync) {
      mkdirSync(dirname(target), { recursive: true })
      const tmp = target + '.tmp-' + process.pid
      try {
        writeFileSync(tmp, bytes)
        if (hash(readFileSync(tmp)) !== sha256) throw new Error('Copy mismatch: ' + name)
        renameSync(tmp, target)
      } finally {
        if (existsSync(tmp)) rmSync(tmp)
      }
    }
    const matched = existsSync(target) && hash(readFileSync(target)) === sha256
    if (!matched) bad++
    checked.push({ module: name, matched, previous_sha256: previous, expected_sha256: sha256 })
  }
} finally {
  closeSync(fd)
}
process.stdout.write(JSON.stringify({ result: bad ? 'FAIL' : 'PASS', synced: sync, checked }) + '\n')
if (bad) process.exitCode = 1
