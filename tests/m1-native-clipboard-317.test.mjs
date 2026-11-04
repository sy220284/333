import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isLocalLinuxClipboardDisplay,
  readLinuxClipboardNative,
  writeLinuxClipboardNative,
} from '../src/ink/termio/clipboardNative317.mjs'

test('M1 C19-T04: native clipboard only trusts local X11 and Wayland displays', () => {
  assert.equal(isLocalLinuxClipboardDisplay({ DISPLAY: ':0' }), true)
  assert.equal(isLocalLinuxClipboardDisplay({ DISPLAY: 'unix:0' }), true)
  assert.equal(isLocalLinuxClipboardDisplay({ WAYLAND_DISPLAY: 'wayland-0' }), true)
  assert.equal(isLocalLinuxClipboardDisplay({ DISPLAY: 'localhost:10.0' }), false)
  assert.equal(isLocalLinuxClipboardDisplay({
    DISPLAY: '192.0.2.4:0', WAYLAND_DISPLAY: 'wayland-0',
  }), false, 'Remote X11 must not fall through to Wayland')
  assert.equal(isLocalLinuxClipboardDisplay({}), false)
})

test('M1 C19-T04: network forwarded displays cannot invoke native clipboard extension', async () => {
  const display = process.env.DISPLAY
  const wayland = process.env.WAYLAND_DISPLAY
  try {
    process.env.DISPLAY = 'localhost:10.0'
    process.env.WAYLAND_DISPLAY = 'wayland-0'
    assert.equal(writeLinuxClipboardNative('remote-display-denied'), false)
    assert.equal(await readLinuxClipboardNative(), null)
  } finally {
    if (display === undefined) delete process.env.DISPLAY
    else process.env.DISPLAY = display
    if (wayland === undefined) delete process.env.WAYLAND_DISPLAY
    else process.env.WAYLAND_DISPLAY = wayland
  }
})
