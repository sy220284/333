import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
function required(name) {
  const i = args.indexOf(name)
  if (i < 0 || !args[i + 1]) throw new Error('Missing ' + name)
  return resolve(args[i + 1])
}
const native = required('--binary')
const manifestFile = required('--manifest')
const vendor = required('--vendor-root')
const platform = process.platform + '-' + process.arch
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
const officialKey = process.platform + '-' + process.arch
const expected = manifest.platforms?.[officialKey]?.checksum
assert.match(expected ?? '', /^[0-9a-f]{64}$/i,
  'Official 2.1.317 manifest missing checksum for ' + officialKey)
const officialBytes = readFileSync(native)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
assert.equal(hash(officialBytes), expected.toLowerCase(), 'Official binary checksum mismatch')
const audio = join(vendor, 'audio-capture',
  process.arch + '-' + process.platform, 'audio-capture.node')
const candidateBytes = readFileSync(audio)
assert.ok(statSync(audio).isFile() && candidateBytes.length > 100_000, 'Invalid bundled audio module')
const needle = candidateBytes.subarray(0, 8192)
let matching = false
let position = officialBytes.indexOf(needle)
const offsets = []
while (position >= 0) {
  offsets.push(position)
  if (position + candidateBytes.length <= officialBytes.length &&
      officialBytes.subarray(position, position + candidateBytes.length).equals(candidateBytes)) {
    matching = true
    break
  }
  position = officialBytes.indexOf(needle, position + 1)
}
const result = {
  platform, original_sha256: expected.toLowerCase(),
  original_bytes: officialBytes.length,
  audio_sha256: hash(candidateBytes),
  audio_bytes: candidateBytes.length,
  matching_original_offset: matching ? position : null,
  prefix_occurrences: offsets.length,
  result: matching ? 'PASS' : 'FAIL',
}
process.stdout.write(JSON.stringify(result) + '\n')
if (!matching) {
  throw new Error('Bundled audio-capture.node differs from official 2.1.317 ' +
    officialKey + ' executable; rebuild the platform native resource from the original')
}
