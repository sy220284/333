import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldUseCompactWelcome } from '../src/components/LogoV2/welcomeLayout.ts'

test('欢迎页在不足 30 行或启用屏幕阅读器时使用精简布局', () => {
  assert.equal(shouldUseCompactWelcome(24, false), true)
  assert.equal(shouldUseCompactWelcome(29, false), true)
  assert.equal(shouldUseCompactWelcome(30, false), false)
  assert.equal(shouldUseCompactWelcome(40, true), true)
})
