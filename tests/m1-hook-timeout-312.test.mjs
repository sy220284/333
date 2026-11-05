import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveHookTimeoutMs } from '../src/utils/hooks/hookTimeout.mjs'

test('subsecond configured hook timeouts count as at least one second', () => {
  for (const seconds of [0, 0.1, 0.5, 0.999, 1]) {
    assert.equal(resolveHookTimeoutMs(seconds,60000), 1000, String(seconds))
  }
  assert.equal(resolveHookTimeoutMs(undefined,30000),30000)
  assert.equal(resolveHookTimeoutMs(3,30000),3000)
  assert.throws(()=>resolveHookTimeoutMs(-1,30000),RangeError)
})

test('command, prompt, agent, callback and HTTP hooks all use the shared unit conversion', () => {
  for (const file of [
    'src/utils/hooks.ts',
    'src/utils/hooks/execAgentHook.ts',
    'src/utils/hooks/execPromptHook.ts',
    'src/utils/hooks/execHttpHook.ts',
  ]) {
    const src=readFileSync(new URL(`../${file}`,import.meta.url),'utf8')
    assert.match(src,/resolveHookTimeoutMs\(hook\.timeout,/,file)
    assert.doesNotMatch(src,/hook\.timeout\s*\?\s*hook\.timeout\s*\*\s*1000/,file)
  }
})
