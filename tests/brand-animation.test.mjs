import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '..')
const source = path => readFileSync(resolve(root, path), 'utf8')

test('333 标识覆盖完整及精简欢迎界面，动效支持低动态和读屏模式', () => {
  const logo = source('src/components/LogoV2/LogoV2.tsx')
  const condensed = source('src/components/LogoV2/CondensedLogo.tsx')
  const animated = source('src/components/LogoV2/AnimatedBrandMark.tsx')
  assert.ok(logo.includes('<BrandMark />'))
  assert.ok(condensed.includes('<AnimatedBrandMark />'))
  assert.ok(condensed.includes('<BrandMark />'))
  assert.ok(animated.includes('useAnimationFrame('))
  assert.ok(animated.includes('prefersReducedMotion'))
  assert.ok(animated.includes('isScreenReaderEnabled()'))
  assert.ok(animated.includes('width={9} height={3}'))
  assert.ok(source('src/components/LogoV2/BrandMark.tsx').includes('333'))
  assert.doesNotMatch(logo + condensed, /Clawd|AnimatedClawd|Claude Code/)
  for (const path of ['Clawd.tsx','AnimatedClawd.tsx','clawdAnimationData.ts','clawdAnimationData.mjs','clawdAnimationSelection.ts']) {
    assert.equal(existsSync(resolve(root, 'src/components/LogoV2', path)), false, path)
  }
})
