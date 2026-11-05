import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// C19-T01: the release's own native addons are the authoritative artifacts.
// Sync only after every embedded source byte has matched the pinned x64 binary.
// Usage: node build/sync-official-native.mjs --decompiled DIR --binary FILE --vendor-root DIR [--sync]
const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
function required(flag) {
  const index = args.indexOf(flag)
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--'))
    throw new Error('Missing ' + flag)
  return resolve(args[index + 1])
}
const decompiled = required('--decompiled')
const binary = required('--binary')
const vendor = required('--vendor-root')
const sync = args.includes('--sync')
execFileSync(process.execPath, [
  join(here, 'verify-official-decompile.mjs'),
  '--decompiled', decompiled, '--binary', binary,
], { stdio: 'pipe', encoding: 'utf8', maxBuffer: 1024 * 1024 })
const records = JSON.parse(readFileSync(
  join(decompiled, '00_说明和核验/模块总清单.json'), 'utf8',
)).files.filter(record => record.loader === 'napi')
if (records.length === 0) throw new Error('No native modules in the official executable')
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const checked = []
let bad = 0
for (const record of records) {
  const name = basename(record.file)
  if (!name.endsWith('.node') || name !== record.file)
    throw new Error('Invalid native module path: ' + record.file)
  const native = join(decompiled, '01_完整嵌入文件_原样', name)
  const destination = join(vendor, name.slice(0, -5), 'x64-linux', name)
  if (hash(native) !== record.sha256) throw new Error('Invalid source module: ' + name)
  const previous = existsSync(destination) ? hash(destination) : null
  if (previous !== record.sha256 && sync) {
    mkdirSync(dirname(destination), { recursive: true })
    const temp = destination + '.tmp-' + process.pid
    try {
      copyFileSync(native, temp)
      if (hash(temp) !== record.sha256) throw new Error('Temporary copy mismatch: ' + name)
      renameSync(temp, destination)
    } finally {
      if (existsSync(temp)) rmSync(temp)
    }
  }
  const actual = existsSync(destination) ? hash(destination) : null
  const matched = actual === record.sha256
  if (!matched) bad++
  checked.push({ module: name, matched, old_sha256: previous, expected_sha256: record.sha256 })
}
process.stdout.write(JSON.stringify({ result: bad ? 'FAIL' : 'PASS', synced: sync, checked }) + '\n')
if (bad) process.exitCode = 1
