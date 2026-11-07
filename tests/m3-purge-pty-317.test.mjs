import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('旧终端删除选择器已移除，CLI 只接受显式 --yes 或预览', () => {
  const source = readFileSync(new URL('../src/cli/handlers/purge.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from '\.\.\/\.\.\/ink\.js'/)
  assert.doesNotMatch(source, /<Select|<KeybindingSetup|<Box/)
  assert.match(source, /options\.interactive/)
  assert.match(source, /options\.yes/)
  assert.match(source, /planPurge/)
  assert.match(source, /executePurgeItem/)
})
