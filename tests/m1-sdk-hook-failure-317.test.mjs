import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifySdkCallbackFailure } from '../src/utils/hooks/callbackFailurePolicy.mjs'

test('2.1.317: configured block stops an SDK callback throwing an error', () => {
  assert.deepEqual(classifySdkCallbackFailure('block', new Error('policy unavailable')),
    { blocked: true, detail: 'policy unavailable' })
})

test('2.1.317: invalid callback output is blocking when configured', () => {
  assert.equal(classifySdkCallbackFailure('block', new TypeError('invalid JSON')).blocked, true)
})

test('default SDK callback failures are reported without blocking', () => {
  assert.deepEqual(classifySdkCallbackFailure(undefined, new Error('SDK disconnected')),
    { blocked: false, detail: 'SDK disconnected' })
})

test('SDK callback failures retain meaningful reasons for non-Error exceptions', () => {
  assert.deepEqual(classifySdkCallbackFailure('block', 'invalid response'),
    { blocked: true, detail: 'invalid response' })
})

test('2.1.317: callback transport propagates failures and onFailure travels through protocol', () => {
  const root = new URL('../src/', import.meta.url)
  const io = readFileSync(new URL('cli/structuredIO.ts', root), 'utf8')
  const printing = readFileSync(new URL('cli/print.ts', root), 'utf8')
  const schema = readFileSync(new URL('entrypoints/sdk/controlSchemas.ts', root), 'utf8')
  const hooks = readFileSync(new URL('utils/hooks.ts', root), 'utf8')
  assert.match(schema, /onFailure: z\.literal\('block'\)\.optional\(\)/)
  assert.match(printing, /createHookCallback\(callbackId, matcher\.timeout, matcher\.onFailure\)/)
  assert.match(io, /onFailure,\s*callback: async/)
  assert.doesNotMatch(io.split('createHookCallback(')[1].split('handleElicitation(')[0], /return \{\}/)
  assert.match(hooks, /classifySdkCallbackFailure\(hook\.onFailure, error\)/)
  assert.match(hooks, /blocked: hook\.onFailure === 'block'/)
})
