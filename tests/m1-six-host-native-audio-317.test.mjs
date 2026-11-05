import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, lstatSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const target = process.platform + '-' + process.arch
const manifest = JSON.parse(readFileSync(join(root, 'build/official-native-audio-317.json'), 'utf8'))
const pinned = manifest.modules[target]
const filename = join(root, 'vendor/audio-capture', process.arch + '-' + process.platform, 'audio-capture.node')

test('M1 original 317: native CI runner must match requested OS and architecture', () => {
  assert.equal(target, process.env.M1_TARGET_PLATFORM)
  assert.equal(manifest.version, '2.1.317')
  assert.ok(pinned, target + ': missing pinned module')
})

test('M1 original 317: native addon is byte-identical to official platform release', () => {
  assert.equal(lstatSync(filename).isFile(), true)
  const bytes = readFileSync(filename)
  assert.equal(bytes.length, pinned.audio_size, target + ': byte count')
  assert.equal(createHash('sha256').update(bytes).digest('hex'), pinned.audio_sha256,
    target + ': original official N-API digest')
})

test('M1 original 317: real six-host N-API import, idle, stop and authorization', () => {
  const addon = createRequire(import.meta.url)(filename)
  const methods = ['startRecording', 'stopRecording', 'isRecording', 'startPlayback',
    'writePlaybackData', 'stopPlayback', 'isPlaying', 'microphoneAuthorizationStatus']
  for (const key of methods)
    assert.equal(typeof addon[key], 'function', target + ': missing native API ' + key)
  assert.equal(addon.isRecording(), false)
  assert.equal(addon.isPlaying(), false)
  addon.stopRecording()
  addon.stopRecording()
  addon.stopPlayback()
  addon.stopPlayback()
  assert.equal(addon.isRecording(), false)
  assert.equal(addon.isPlaying(), false)
  const microphone = addon.microphoneAuthorizationStatus()
  assert.ok([0,1,2,3].includes(microphone), target + ': unexpected permission status ' + microphone)
  console.log(JSON.stringify({target,loaded:true,idle:true,microphone}))
})
