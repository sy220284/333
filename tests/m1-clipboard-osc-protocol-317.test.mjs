import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clipboardMultiplexer, encodeClipboardOsc52,
  isVteTerminal, suppressClipboardOsc52,
} from '../src/ink/termio/clipboardOsc317.mjs'

const ESC = '\x1b'
const BEL = '\x07'
const ST = ESC + '\\'
const source = '剪贴板原生协议'
const b64 = Buffer.from(source).toString('base64')
const osc = ESC + ']52;c;' + b64 + BEL

test('M1 C19-T04: raw OSC and Kitty ST match official 317 for UTF-8 bytes', () => {
  assert.equal(encodeClipboardOsc52(b64), osc)
  assert.equal(encodeClipboardOsc52(b64, null, ST), ESC + ']52;c;' + b64 + ST)
  assert.throws(() => encodeClipboardOsc52('\x1b]52'), /base64/)
})

test('M1 C19-T04: tmux gets raw OSC plus DCS passthrough even when buffer load fails', () => {
  assert.equal(encodeClipboardOsc52(b64, 'tmux'),
    osc + ESC + 'Ptmux;' + osc.replaceAll(ESC, ESC + ESC) + ST)
})

test('M1 C19-T04: screen wraps 76-byte chunks in DCS boundaries', () => {
  const payload = Buffer.from('你好'.repeat(58)).toString('base64')
  const chunks = payload.match(/.{1,76}/g) ?? []
  assert.ok(chunks.length >= 4)
  assert.equal(encodeClipboardOsc52(payload, 'screen'),
    ESC + 'P' + ESC + ']52;c;' + chunks.join(ST + ESC + 'P') + BEL + ST)
})

test('M1 C19-T04: tmux/screen/zellij multiplexers retain original priority', () => {
  assert.equal(clipboardMultiplexer({ TMUX: 'sock', STY: 's', ZELLIJ: 'z' }), 'tmux')
  assert.equal(clipboardMultiplexer({ STY: 'screen' }), 'screen')
  assert.equal(clipboardMultiplexer({ ZELLIJ: 'zellij' }), 'zellij')
  assert.equal(clipboardMultiplexer({}), null)
})

test('M1 C19-T04: VTE safety gates OSC based on original terminal identity and native success', () => {
  const environment = { VTE_VERSION: '6800', TERM: 'xterm-256color' }
  assert.equal(isVteTerminal('gnome-terminal', environment), true)
  assert.equal(isVteTerminal('kitty', environment), false)
  assert.equal(isVteTerminal('gnome-terminal', { ...environment, TMUX: 'sock' }), false)
  assert.equal(isVteTerminal('gnome-terminal', { ...environment, KITTY_WINDOW_ID: '1' }), false)
  assert.equal(suppressClipboardOsc52({
    platform: 'linux', terminal: 'gnome-terminal', environment,
    nativeWriteSucceeded: true,
  }), true)
  assert.equal(suppressClipboardOsc52({
    platform: 'linux', terminal: 'gnome-terminal', environment,
    nativeWriteSucceeded: false,
  }), false)
  assert.equal(suppressClipboardOsc52({
    platform: 'windows', terminal: 'gnome-terminal', environment,
    nativeWriteSucceeded: true,
  }), false)
  assert.equal(suppressClipboardOsc52({
    platform: 'wsl', terminal: 'gnome-terminal', environment,
    nativeWriteSucceeded: true,
  }), true)
  assert.equal(suppressClipboardOsc52({
    platform: 'linux', terminal: 'gnome-terminal',
    environment: { ...environment, VTE_VERSION: '5200' },
  }), true)
  assert.equal(suppressClipboardOsc52({
    platform: 'macos', terminal: 'xterm', environment: {},
    printsUnknownSequences: true,
  }), true)
})
