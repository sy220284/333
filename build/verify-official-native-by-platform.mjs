import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const args = process.argv.slice(2)
function required(name) {
  const i = args.indexOf(name)
  if (i < 0 || !args[i + 1]) throw new Error('Missing ' + name)
  return resolve(args[i + 1])
}
const native = required('--binary')
const manifestFile = required('--manifest')
const vendor = required('--vendor-root')
const sync = args.includes('--sync')
const platform = process.platform + '-' + process.arch
assert.ok(['darwin-arm64', 'darwin-x64', 'win32-x64', 'win32-arm64'].includes(platform),
  'Native extraction only supports official macOS or Windows host architecture')
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
const pinned = JSON.parse(readFileSync(join(resolve(import.meta.dirname, '..'),
  'build/official-native-audio-317.json'), 'utf8'))
assert.equal(pinned.version, '2.1.317')
assert.ok(pinned.modules?.[platform], 'No independently verified 2.1.317 platform record: ' + platform)
const expected = manifest.platforms?.[platform]?.checksum
assert.match(expected ?? '', /^[0-9a-f]{64}$/i,
  'Official 2.1.317 manifest missing checksum for ' + platform)
const original = readFileSync(native)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
assert.equal(hash(original), expected.toLowerCase(), 'Official binary checksum mismatch')
assert.equal(expected.toLowerCase(), pinned.modules[platform].binary_sha256,
  'Official manifest is inconsistent with independently verified platform SHA-256')
const audio = join(vendor, 'audio-capture',
  process.arch + '-' + process.platform, 'audio-capture.node')

function machCandidate(bytes, at) {
  if (at + 32 > bytes.length || bytes.readUInt32LE(at) !== 0xfeedfacf) return null
  const cpu = process.arch === 'arm64' ? 0x0100000c : 0x01000007
  if (bytes.readUInt32LE(at + 4) !== cpu || bytes.readUInt32LE(at + 12) !== 6) return null
  const commands = bytes.readUInt32LE(at + 16)
  const commandsSize = bytes.readUInt32LE(at + 20)
  if (commands < 2 || commands > 128 || commandsSize > 0x20000) return null
  let pos = at + 32, end = 0
  for (let i = 0; i < commands; i++) {
    if (pos + 8 > at + 32 + commandsSize || pos + 8 > bytes.length) return null
    const kind = bytes.readUInt32LE(pos)
    const size = bytes.readUInt32LE(pos + 4)
    if (size < 8 || pos + size > at + 32 + commandsSize) return null
    if (kind === 0x19) { // LC_SEGMENT_64
      if (size < 72) return null
      end = Math.max(end,
        Number(bytes.readBigUInt64LE(pos + 40)) +
        Number(bytes.readBigUInt64LE(pos + 48)))
    } else if (kind === 0x1d) { // LC_CODE_SIGNATURE
      if (size < 16) return null
      end = Math.max(end, bytes.readUInt32LE(pos + 8) + bytes.readUInt32LE(pos + 12))
    }
    pos += size
  }
  return end >= 100_000 && end <= 10_000_000 && at + end <= bytes.length
    ? bytes.subarray(at, at + end) : null
}

function peCandidate(bytes, at) {
  if (at + 0x100 >= bytes.length || bytes[at] !== 0x4d || bytes[at + 1] !== 0x5a)
    return null
  const peOffset = bytes.readUInt32LE(at + 0x3c)
  if (peOffset < 0x40 || peOffset > 0x2000) return null
  const hdr = at + peOffset
  if (hdr + 24 >= bytes.length ||
      bytes.toString('latin1', hdr, hdr + 4) !== 'PE\0\0') return null
  const machine = process.arch === 'arm64' ? 0xaa64 : 0x8664
  const count = bytes.readUInt16LE(hdr + 6)
  const optSize = bytes.readUInt16LE(hdr + 20)
  if (bytes.readUInt16LE(hdr + 4) !== machine ||
      !(bytes.readUInt16LE(hdr + 22) & 0x2000) ||
      count < 2 || count > 32 || optSize > 512) return null
  const first = hdr + 24 + optSize
  if (first + count * 40 > bytes.length) return null
  let end = 0
  for (let i = 0; i < count; i++) {
    const sec = first + 40 * i
    end = Math.max(end, bytes.readUInt32LE(sec + 16) + bytes.readUInt32LE(sec + 20))
  }
  return end >= 100_000 && end <= 10_000_000 && at + end <= bytes.length
    ? bytes.subarray(at, at + end) : null
}

const magic = process.platform === 'darwin' ? Buffer.from([0xcf, 0xfa, 0xed, 0xfe]) : Buffer.from('MZ')
const matcher = process.platform === 'darwin' ? machCandidate : peCandidate
const matches = []
let pos = original.indexOf(magic)
while (pos >= 0) {
  const file = matcher(original, pos)
  if (file && ['napi_register_module_v1', 'startRecording', 'stopRecording',
    'microphoneAuthorizationStatus'].every(symbol => file.includes(Buffer.from(symbol)))) {
    matches.push({ at: pos, bytes: file })
  }
  pos = original.indexOf(magic, pos + 1)
}
assert.equal(matches.length, 1, 'Expected exactly one 2.1.317 audio-capture native addon, found ' + matches.length)
const { at: nativeOffset, bytes: officialAudio } = matches[0]
const expectedAddonSha256 = hash(officialAudio)
assert.equal(nativeOffset, pinned.modules[platform].audio_offset, 'Original NAPI offset differs')
assert.equal(officialAudio.length, pinned.modules[platform].audio_size, 'Original NAPI size differs')
assert.equal(expectedAddonSha256, pinned.modules[platform].audio_sha256, 'Original NAPI hash differs')
const existing = existsSync(audio) ? readFileSync(audio) : null
const previousSha256 = existing ? hash(existing) : null
if (sync && previousSha256 !== expectedAddonSha256) {
  mkdirSync(dirname(audio), { recursive: true })
  const temporary = audio + '.verified-' + process.pid
  try {
    writeFileSync(temporary, officialAudio)
    assert.equal(hash(readFileSync(temporary)), expectedAddonSha256)
    renameSync(temporary, audio)
  } finally {
    if (existsSync(temporary)) rmSync(temporary)
  }
}
const exact = existsSync(audio) && readFileSync(audio).equals(officialAudio)
const result = {
  platform, original_sha256: expected.toLowerCase(), original_bytes: original.length,
  native_offset: nativeOffset, audio_sha256: expectedAddonSha256,
  audio_bytes: officialAudio.length, previous_sha256: previousSha256,
  synced: sync, matches: matches.length, result: exact ? 'PASS' : 'FAIL',
}
process.stdout.write(JSON.stringify(result) + '\n')
if (!exact) throw new Error('Bundled audio-capture addon differs from official 2.1.317 ' +
  platform + ' native bytes; rerun with --sync to extract the verified original')
