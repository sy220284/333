import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const args = process.argv.slice(2)
function required(flag) {
  const i = args.indexOf(flag)
  if (i === -1 || !args[i + 1] || args[i + 1].startsWith('--'))
    throw Error('Missing ' + flag)
  return resolve(args[i + 1])
}
const officialRoot = required('--official-root')
const vendorRoot = required('--vendor-root')
const sync = args.includes('--sync')
const root = resolve(import.meta.dirname, '..')
const pinned = JSON.parse(readFileSync(join(root, 'build/official-native-audio-317.json'), 'utf8'))
const linuxX64 = JSON.parse(readFileSync(join(root, 'build/official-native-317.json'), 'utf8'))
const release = JSON.parse(readFileSync(join(root, 'docs/upgrade/m1-evidence/target-release.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(officialRoot, 'manifest.json'), 'utf8'))
assert.equal(pinned.version, release.target_version, 'Platform addon catalog target mismatch')
assert.equal(linuxX64.version, release.target_version, 'Clipboard catalog target mismatch')
assert.equal(linuxX64.binary_sha256, release.verified_x64_sha256, 'Original x64 mismatch')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const expectedTargets = [
  'linux-x64', 'linux-arm64', 'darwin-x64',
  'darwin-arm64', 'win32-x64', 'win32-arm64',
]
assert.deepEqual(Object.keys(pinned.modules).sort(), [...expectedTargets].sort(),
  'Platform list must contain all official 2.1.317 native targets')

const records = []
const staged = []
for (const target of expectedTargets) {
  const [os, arch] = target.split('-')
  const executable = join(officialRoot, target, os === 'win32' ? 'claude.exe' : 'claude')
  const expected = pinned.modules[target]
  const declared = manifest.platforms?.[target]?.checksum
  assert.equal(declared?.toLowerCase(), expected.binary_sha256,
    'Official release manifest differs from pinned 317 binary: ' + target)
  const bytes = readFileSync(executable)
  assert.equal(hash(bytes), expected.binary_sha256, 'Official binary hash differs: ' + target)
  const audio = bytes.subarray(expected.audio_offset, expected.audio_offset + expected.audio_size)
  assert.equal(audio.length, expected.audio_size, 'Truncated original audio addon: ' + target)
  assert.equal(hash(audio), expected.audio_sha256, 'Original audio addon hash differs: ' + target)
  const targetFile = join(vendorRoot, 'audio-capture', arch + '-' + os, 'audio-capture.node')
  staged.push({ file: targetFile, bytes: audio, sha256: expected.audio_sha256, target })
  if (target === 'linux-x64') {
    assert.equal(linuxX64.platform, 'x64-linux')
    for (const module of linuxX64.modules) {
      const part = bytes.subarray(module.offset, module.offset + module.size)
      assert.equal(part.length, module.size, 'Truncated official NAPI: ' + module.name)
      assert.equal(hash(part), module.sha256, 'Original NAPI checksum mismatch: ' + module.name)
      if (module.name !== 'clipboard-napi.node') continue
      staged.push({
        file: join(vendorRoot, 'clipboard-napi', 'x64-linux', module.name),
        bytes: part, sha256: module.sha256, target,
      })
    }
  }
}
assert.equal(staged.length, 7, 'Expected six audio addons and one Linux clipboard addon')

// Verify *every* original release before touching the source vendor tree.
// The workspace may be replaced only when the complete official release set
// passes version, full binary and embedded module checks.
for (const record of staged) {
  const current = existsSync(record.file) ? hash(readFileSync(record.file)) : null
  const changed = current !== record.sha256
  if (sync && changed) {
    mkdirSync(dirname(record.file), { recursive: true })
    const temporary = record.file + '.official-317-' + process.pid
    try {
      writeFileSync(temporary, record.bytes, { flag: 'wx', mode: 0o644 })
      assert.equal(hash(readFileSync(temporary)), record.sha256)
      renameSync(temporary, record.file)
    } finally {
      if (existsSync(temporary)) rmSync(temporary)
    }
  }
  const actual = existsSync(record.file) ? readFileSync(record.file) : null
  const valid = actual !== null && actual.equals(record.bytes)
  records.push({
    platform: record.target, name: record.file.slice(vendorRoot.length + 1),
    previous_sha256: current, expected_sha256: record.sha256,
    updated: sync && changed, verified: valid,
  })
}
const pass = records.every(x => x.verified)
console.log(JSON.stringify({ target: release.target_version, synced: sync,
  verified_platforms: expectedTargets.length, result: pass ? 'PASS' : 'FAIL', records }))
if (!pass) process.exitCode = 1
