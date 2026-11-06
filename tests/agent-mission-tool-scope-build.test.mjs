import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
test('Mission 工具在列出和更新前校验项目归属', () => {
  const src = read('src/tools/MissionTool/MissionTool.ts')
  assert.match(src, /filter\(m => resolve\(m\.projectDir\) === resolve\(getCwd\(\)\)\)/)
  assert.match(src, /if \(resolve\(mission\.projectDir\) !== resolve\(getCwd\(\)\)\)/)
})
