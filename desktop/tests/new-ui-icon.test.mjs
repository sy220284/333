import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
test('桌面图标不再使用旧蓝紫产品视觉标识',()=>{
  const icon=readFileSync(new URL('../build/icon.svg',import.meta.url),'utf8')
  assert.ok(icon.includes('摇摇车应用图标'))
  assert.ok(icon.includes('#96442B'))
  assert.ok(!icon.includes('#304A88'))
  assert.ok(!icon.includes('#6675F6'))
})
