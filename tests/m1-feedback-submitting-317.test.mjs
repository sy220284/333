import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

test('2.1.317: feedback dialog suppresses confirm hint while submitting', () => {
  const ui = readFileSync(new URL('../src/components/Feedback.tsx', import.meta.url),'utf8')
  const dialog = readFileSync(new URL('../src/components/design-system/Dialog.tsx', import.meta.url),'utf8')
  assert.match(ui, /hideInputGuide=\{step === 'submitting'\}/)
  assert.match(dialog, /!hideInputGuide &&/)
  assert.match(ui, /step === 'submitting' && <Box/)
})

test('2.1.317: feedback still presents interactive submit on consent step', () => {
  const ui = readFileSync(new URL('../src/components/Feedback.tsx', import.meta.url),'utf8')
  assert.match(ui, /step === 'consent' && \(key\.return \|\| input === ' '\)/)
  assert.match(ui, /step === 'consent' \? <Byline>/)
  assert.match(ui, /step === 'done' && <Box/)
})
