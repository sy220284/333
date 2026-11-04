import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const source = join(root, 'native/audio-capture-src/index.ts')
const platform = process.arch + '-' + process.platform
const original = join(root, 'vendor/audio-capture', platform, 'audio-capture.node')

test('M1 C19-T04: compiled Bun process loads exact platform audio addon, and correctly reports removal', {
  timeout: 90_000,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), '333-audio-compiled-317-'))
  const file = join(dir, 'entry.ts')
  const binary = join(dir, process.platform === 'win32' ? 'audio-check.exe' : 'audio-check')
  const target = join(dir, 'vendor/audio-capture', platform, 'audio-capture.node')
  try {
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(original, target)
    writeFileSync(file,
      'import { isNativeAudioAvailable, isNativeRecordingActive, isNativePlaying, ' +
      'stopNativeRecording, stopNativePlayback, microphoneAuthorizationStatus } from ' +
      JSON.stringify(pathToFileURL(source).href) + ';\n' +
      'const available=isNativeAudioAvailable(); ' +
      'if(available){stopNativeRecording();stopNativeRecording();stopNativePlayback();stopNativePlayback()};' +
      'console.log(JSON.stringify({available,recording:isNativeRecordingActive(),playing:isNativePlaying(),' +
      'microphone:microphoneAuthorizationStatus()}));\n',
    )
    const build = spawnSync('bun', ['build', file, '--compile', '--outfile', binary], {
      cwd: dir, encoding: 'utf8', timeout: 90_000,
    })
    assert.equal(build.error, undefined, String(build.error))
    assert.equal(build.status, 0, build.stderr)
    const run = () => {
      const output = spawnSync(binary, [], {
        cwd: dir, encoding: 'utf8', timeout: 15_000,
        env: { ...process.env, DISABLE_TELEMETRY: '1' },
      })
      assert.equal(output.error, undefined, String(output.error))
      assert.equal(output.status, 0, output.stderr)
      return JSON.parse(output.stdout.trim())
    }
    const on = run()
    assert.equal(on.available, true, 'Packaged official native addon could not load')
    assert.equal(on.recording, false, 'Audio recording started unexpectedly')
    assert.equal(on.playing, false, 'Playback started unexpectedly')
    assert.ok([0, 1, 2, 3].includes(on.microphone), 'Invalid microphone authorization status')
    renameSync(target, target + '.missing')
    const off = run()
    assert.equal(off.available, false, 'Runtime incorrectly retained missing addon')
    assert.equal(off.recording, false)
    assert.equal(off.playing, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
