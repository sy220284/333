import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  isLinuxClipboardAddonLoadable,
  readLinuxClipboardNative,
  writeLinuxClipboardNative,
} from '../src/ink/termio/clipboardNative317.mjs'

const load = createRequire(import.meta.url)
const nativePath = resolve(import.meta.dirname,
  '../vendor/clipboard-napi/x64-linux/clipboard-napi.node')

test('M1 C19-T04: official 317 Linux N-API writes and reads back UTF-8 via actual X server', {
  skip: process.platform !== 'linux' || process.arch !== 'x64',
}, async () => {
  assert.ok(process.env.DISPLAY, 'Run under xvfb-run to test a real X11 clipboard')
  const native = load(nativePath)
  assert.equal(typeof native.getLinuxClipboardText, 'function')
  assert.equal(typeof native.setLinuxClipboardText, 'function')
  assert.equal(isLinuxClipboardAddonLoadable(), true)

  const oldSSH = process.env.SSH_CONNECTION
  delete process.env.SSH_CONNECTION
  try {
    for (const value of [
      'M1-2.1.317-Linux-x64 中文 Unicode ✓',
      'second-update: 新版原生剪贴板 ☁️',
    ]) {
      assert.equal(native.setLinuxClipboardText(value), true)
      assert.equal(await native.getLinuxClipboardText(false, 1800), value)
      assert.equal(writeLinuxClipboardNative(value), true)
      assert.equal(await readLinuxClipboardNative(false, 1800), value)
    }
  } finally {
    if (oldSSH !== undefined) process.env.SSH_CONNECTION = oldSSH
  }
})
