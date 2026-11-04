import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('M1 C19-T04: official 317 audio N-API exports idle and idempotent stop lifecycle', {
  skip: !(process.platform === 'linux' && process.arch === 'x64'),
}, () => {
  const require = createRequire(import.meta.url)
  const addon = require(resolve(import.meta.dirname,
    '../vendor/audio-capture/x64-linux/audio-capture.node'))
  const expected = [
    'isPlaying', 'isRecording', 'stopPlayback', 'startPlayback',
    'stopRecording', 'startRecording', 'writePlaybackData',
    'microphoneAuthorizationStatus',
  ]
  assert.deepEqual(Object.keys(addon).sort(), expected.sort())
  assert.equal(addon.isPlaying(), false)
  assert.equal(addon.isRecording(), false)
  assert.equal(typeof addon.microphoneAuthorizationStatus(), 'number')
  assert.equal(addon.stopPlayback(), undefined)
  assert.equal(addon.stopRecording(), undefined)
  assert.equal(addon.stopPlayback(), undefined)
  assert.equal(addon.stopRecording(), undefined)
  assert.equal(addon.isPlaying(), false)
  assert.equal(addon.isRecording(), false)
})
