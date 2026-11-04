import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const argv = process.argv.slice(2)
function get(name) {
  const i = argv.indexOf(name)
  if (i < 0 || !argv[i + 1]) throw new Error('Missing ' + name)
  return argv[i + 1]
}
const target = get('--target')
assert.match(target, /^(?:linux|darwin|win32)-(?:x64|arm64)$/)
const [os, arch] = target.split('-')
const original = readFileSync(resolve(get('--binary')))
const manifest = JSON.parse(readFileSync(resolve(get('--manifest')), 'utf8'))
const expected = manifest.platforms?.[target]?.checksum
assert.match(expected ?? '', /^[a-f0-9]{64}$/i, 'Missing official target checksum')
const hash = b => createHash('sha256').update(b).digest('hex')
assert.equal(hash(original), expected.toLowerCase(), 'Official original binary SHA-256 mismatch')
function goodSize(at, end) {
  return end >= 100_000 && end <= 10_000_000 && at + end <= original.length
}
function macho(at) {
  if (at + 32 > original.length || original.readUInt32LE(at) !== 0xfeedfacf) return null
  const cpu = arch === 'arm64' ? 0x0100000c : 0x01000007
  const n = original.readUInt32LE(at + 16), total = original.readUInt32LE(at + 20)
  if (original.readUInt32LE(at + 4) !== cpu || original.readUInt32LE(at + 12) !== 6 ||
      n < 2 || n > 128 || total > 0x20000) return null
  let pos = at + 32, end = 0
  for (let i = 0; i < n; i++) {
    if (pos + 8 > at + 32 + total || pos + 8 > original.length) return null
    const cmd = original.readUInt32LE(pos), size = original.readUInt32LE(pos + 4)
    if (size < 8 || pos + size > at + 32 + total) return null
    if (cmd === 0x19) {
      if (size < 72) return null
      end = Math.max(end, Number(original.readBigUInt64LE(pos + 40)) +
        Number(original.readBigUInt64LE(pos + 48)))
    }
    if (cmd === 0x1d) {
      if (size < 16) return null
      end = Math.max(end, original.readUInt32LE(pos + 8) + original.readUInt32LE(pos + 12))
    }
    pos += size
  }
  return goodSize(at, end) ? original.subarray(at, at + end) : null
}
function pe(at) {
  if (at + 0x100 > original.length || original[at] !== 0x4d || original[at + 1] !== 0x5a) return null
  const off = original.readUInt32LE(at + 0x3c)
  if (off < 0x40 || off > 0x2000) return null
  const hdr = at + off
  if (hdr + 24 > original.length ||
      original.toString('latin1', hdr, hdr + 4) !== 'PE\0\0') return null
  const machine = arch === 'arm64' ? 0xaa64 : 0x8664
  const count = original.readUInt16LE(hdr + 6), opt = original.readUInt16LE(hdr + 20)
  if (original.readUInt16LE(hdr + 4) !== machine ||
      !(original.readUInt16LE(hdr + 22) & 0x2000) ||
      count < 2 || count > 32 || opt > 512) return null
  const first = hdr + 24 + opt
  if (first + count * 40 > original.length) return null
  let end = 0
  for (let i = 0; i < count; i++) {
    const sec = first + i * 40
    end = Math.max(end, original.readUInt32LE(sec + 16) + original.readUInt32LE(sec + 20))
  }
  return goodSize(at, end) ? original.subarray(at, at + end) : null
}
function elf(at) {
  if (at + 64 > original.length || original.toString('latin1', at, at + 4) !== '\x7fELF') return null
  if (original[at + 4] !== 2 || original[at + 5] !== 1 ||
      original.readUInt16LE(at + 16) !== 3 ||
      original.readUInt16LE(at + 18) !== (arch === 'arm64' ? 183 : 62)) return null
  const shoff = Number(original.readBigUInt64LE(at + 40))
  const entsz = original.readUInt16LE(at + 58), count = original.readUInt16LE(at + 60)
  if (shoff <= 0 || shoff > 10_000_000 || entsz < 64 || entsz > 512 ||
      count < 2 || count > 128 || at + shoff + entsz * count > original.length) return null
  let end = shoff + entsz * count
  for (let i = 0; i < count; i++) {
    const sh = at + shoff + i * entsz
    if (original.readUInt32LE(sh + 4) === 8) continue // SHT_NOBITS
    end = Math.max(end, Number(original.readBigUInt64LE(sh + 24)) +
      Number(original.readBigUInt64LE(sh + 32)))
  }
  return goodSize(at, end) ? original.subarray(at, at + end) : null
}
const magic = os === 'linux' ? Buffer.from([0x7f,0x45,0x4c,0x46]) :
  os === 'darwin' ? Buffer.from([0xcf,0xfa,0xed,0xfe]) : Buffer.from('MZ')
const parse = os === 'linux' ? elf : os === 'darwin' ? macho : pe
const matches = []
let at = original.indexOf(magic)
while (at >= 0) {
  const data = parse(at)
  if (data && ['napi_register_module_v1', 'startRecording', 'stopRecording',
    'microphoneAuthorizationStatus'].every(name => data.includes(Buffer.from(name)))) {
    matches.push({ offset: at, size: data.length, sha256: hash(data) })
  }
  at = original.indexOf(magic, at + 1)
}
assert.equal(matches.length, 1, 'Ambiguous official audio NAPI: ' + JSON.stringify(matches))
console.log(JSON.stringify({ target, binary_sha256: expected.toLowerCase(),
  binary_bytes: original.length, audio: matches[0] }))
