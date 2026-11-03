import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { isRemoteControlDisabledFromSources } from '../src/bridge/remoteControlPolicy.mjs'

test('2.1.317: managed disableRemoteControl blocks even if user sets false', () => {
  assert.equal(isRemoteControlDisabledFromSources([
    { disableRemoteControl: false }, { disableRemoteControl: true },
  ]), true)
})

test('2.1.317: project-only restriction is respected', () => {
  assert.equal(isRemoteControlDisabledFromSources([
    null, { disableRemoteControl: true }, null,
  ]), true)
})

test('2.1.317: absent and false restrictions keep Remote Control eligible', () => {
  assert.equal(isRemoteControlDisabledFromSources([
    null, {}, { disableRemoteControl: false }, undefined,
  ]), false)
})

test('2.1.317: disabled command remains routable to its policy error', () => {
  const command = readFileSync(new URL('../src/commands/bridge/index.ts', import.meta.url),'utf8')
  const enabled = readFileSync(new URL('../src/bridge/bridgeEnabled.ts', import.meta.url),'utf8')
  const cli = readFileSync(new URL('../src/entrypoints/cli.tsx', import.meta.url),'utf8')
  const schema = readFileSync(new URL('../src/utils/settings/types.ts', import.meta.url),'utf8')
  assert.match(command, /isBridgeEnabled\(\) \|\| isRemoteControlDisabledBySettings\(\)/)
  assert.match(enabled, /isRemoteControlDisabledBySettings\(\)/)
  assert.match(enabled, /return 'Remote Control is disabled by the disableRemoteControl setting/)
  assert.match(cli, /if \(isRemoteControlDisabledBySettings\(\)\)/)
  assert.match(schema, /disableRemoteControl: z\s*\.boolean\(\)/)
})
