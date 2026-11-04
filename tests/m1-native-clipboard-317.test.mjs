import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isLocalLinuxClipboardDisplay,
  readLinuxClipboardNative,
  writeLinuxClipboardNative,
  windowsClipboardWriteInvocation,
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
  const ssh = process.env.SSH_CONNECTION
  try {
    process.env.DISPLAY = 'localhost:10.0'
    process.env.WAYLAND_DISPLAY = 'wayland-0'
    assert.equal(writeLinuxClipboardNative('remote-display-denied'), false)
    assert.equal(await readLinuxClipboardNative(), null)
    process.env.DISPLAY = ':0'
    process.env.SSH_CONNECTION = '198.51.100.5 50444 192.0.2.5 22'
    assert.equal(writeLinuxClipboardNative('ssh-forwarded-denied'), false)
    assert.equal(await readLinuxClipboardNative(), null)
  } finally {
    if (display === undefined) delete process.env.DISPLAY
    else process.env.DISPLAY = display
    if (wayland === undefined) delete process.env.WAYLAND_DISPLAY
    else process.env.WAYLAND_DISPLAY = wayland
    if (ssh === undefined) delete process.env.SSH_CONNECTION
    else process.env.SSH_CONNECTION = ssh
  }
})

test('M1 C19-T04: Windows and WSL write Unicode through explicit UTF-8 PowerShell stdin', () => {
  const windows = windowsClipboardWriteInvocation('windows')
  const wsl = windowsClipboardWriteInvocation('wsl')
  assert.equal(windows.command, 'powershell')
  assert.equal(wsl.command, 'powershell.exe')
  assert.deepEqual(windows.args, wsl.args)
  assert.deepEqual(windows.args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-Command'])
  assert.match(windows.args[3], /InputEncoding = \[Text\.Encoding\]::UTF8/)
  assert.match(windows.args[3], /Set-Clipboard -Value/)
  assert.throws(() => windowsClipboardWriteInvocation('linux'), /requires Windows or WSL/)
})
