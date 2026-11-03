import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getClickAnimationNames } from '../src/components/LogoV2/clawdAnimationSelection.ts'

test('普通终端和 Apple Terminal 遵循新版各自动作选择规则', () => {
  assert.equal(getClickAnimationNames(false).length, 14)
  const apple = getClickAnimationNames(true)
  assert.ok(apple.length > 0)
  assert.equal(apple.includes('turn'), false)
  assert.equal(apple.includes('tap'), false)
  assert.equal(apple.includes('skip'), true)
  assert.equal(apple.includes('look'), true)
})
