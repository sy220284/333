import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(join(root, 'build/official-native-audio-317.json'), 'utf8'))
const officialLinux = JSON.parse(readFileSync(join(root, 'build/official-native-317.json'), 'utf8'))
const release = JSON.parse(readFileSync(join(root, 'docs/upgrade/m1-evidence/target-release.json'), 'utf8'))
const hash = data => createHash('sha256').update(data).digest('hex')

test('M1 C19-T01/T04: six officially pinned 317 audio modules are byte identical in the source tree', () => {
  assert.equal(manifest.version, release.target_version)
  assert.deepEqual(Object.keys(manifest.modules).sort(), [
    'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64',
    'win32-x64', 'win32-arm64',
  ].sort())
  for (const [platform, expected] of Object.entries(manifest.modules)) {
    const [os, arch] = platform.split('-')
    const path = join(root, 'vendor', 'audio-capture', arch + '-' + os, 'audio-capture.node')
    assert.equal(lstatSync(path).isFile(), true, path)
    const actual = readFileSync(path)
    assert.equal(actual.length, expected.audio_size, platform + ' size')
    assert.equal(hash(actual), expected.audio_sha256, platform + ' SHA-256')
    assert.ok(Number.isSafeInteger(expected.audio_offset) && expected.audio_offset > 0,
      platform + ' official offset')
    assert.match(expected.binary_sha256, /^[a-f0-9]{64}$/)
  }
})

test('M1 C19-T01/T04: Linux clipboard is the official 317 embedded native addon, not a generated fallback', () => {
  assert.equal(officialLinux.version, manifest.version)
  assert.equal(officialLinux.binary_sha256, manifest.modules['linux-x64'].binary_sha256)
  const pinned = officialLinux.modules.find(item => item.name === 'clipboard-napi.node')
  assert.ok(pinned, 'Official catalog lacks Linux clipboard module')
  const path = join(root, 'vendor/clipboard-napi/x64-linux/clipboard-napi.node')
  assert.equal(lstatSync(path).isFile(), true, path)
  const bytes = readFileSync(path)
  assert.equal(bytes.length, pinned.size)
  assert.equal(hash(bytes), pinned.sha256)
})

test('M1 C19-T05: integrity digests are sensitive to binary modifications', () => {
  for (const platform of ['linux-x64', 'darwin-arm64', 'win32-x64']) {
    const [os, arch] = platform.split('-')
    const bytes = readFileSync(join(root, 'vendor/audio-capture', arch + '-' + os, 'audio-capture.node'))
    const mutated = Buffer.from(bytes)
    mutated[Math.floor(bytes.length / 2)] ^= 0x01
    assert.notEqual(hash(mutated), manifest.modules[platform].audio_sha256)
  }
})
