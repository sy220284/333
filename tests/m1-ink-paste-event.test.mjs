import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { stripVTControlCharacters } from 'node:util'
import { fileURLToPath } from 'node:url'

const compiled = process.env.M1_INK_EVENTS_DIR
if (!compiled) throw new Error('M1_INK_EVENTS_DIR must point to compiled Ink event files')
globalThis.Bun = { stripANSI: stripVTControlCharacters }
const require = createRequire(import.meta.url)
const { PasteEvent } = require(resolve(compiled, 'events/paste-event.js'))
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

test('normal paste preserves Unicode and line breaks and produces cancellable DOM event', () => {
  const event = new PasteEvent('第一行\n第二行')
  assert.equal(event.text, '第一行\n第二行')
  assert.equal(event.type, 'paste')
  assert.equal(event.bubbles, true)
  assert.equal(event.cancelable, true)
  event.preventDefault()
  assert.equal(event.defaultPrevented, true)
})

test('ANSI styling is stripped without changing CRLF boundaries', () => {
  assert.equal(new PasteEvent('\x1b[31mRED\x1b[0m\r\nBLUE').text, 'RED\r\nBLUE')
})

test('empty paste, focus-tail detection and copy keep original flags', () => {
  assert.equal(new PasteEvent('').rawEmpty, true)
  assert.equal(new PasteEvent('[I').rawEmpty, true)
  assert.equal(new PasteEvent('[O').rawEmpty, true)
  const original = new PasteEvent('text[I')
  assert.equal(original.rawEndedWithFocusTail, true)
  const copied = new PasteEvent(original)
  assert.equal(copied.text, original.text)
  assert.equal(copied.rawEmpty, original.rawEmpty)
  assert.equal(copied.rawEndedWithFocusTail, true)
})

test('C1 and OSC sequences are removed from pasted text', () => {
  assert.equal(new PasteEvent('hello\u009bworld').text, 'helloworld')
  assert.equal(new PasteEvent('\x1b]0;test\x07hello\x1b[1mworld\x1b[0m').text, 'helloworld')
})

test('paste event respects stopImmediatePropagation', () => {
  const event = new PasteEvent('test')
  event.stopImmediatePropagation()
  assert.equal(event._isPropagationStopped(), true)
  assert.equal(event._isImmediatePropagationStopped(), true)
})

test('real input stream dispatches paste separately while retaining legacy InputEvent', () => {
  const app = readFileSync(resolve(repositoryRoot, 'src/ink/components/App.tsx'), 'utf8')
  const ink = readFileSync(resolve(repositoryRoot, 'src/ink/ink.tsx'), 'utf8')
  assert.match(app, /app\.internal_eventEmitter\.emit\('input', event\)/)
  assert.match(app, /if \(item\.isPasted\)\s*\{\s*app\.props\.dispatchPasteEvent\(item\.sequence \?\? ''\)/)
  assert.match(ink, /dispatcher\.dispatchDiscrete\(target, new PasteEvent\(text\)\)/)
  assert.match(ink, /dispatchPasteEvent=\{this\.dispatchPasteEvent\}/)
})
