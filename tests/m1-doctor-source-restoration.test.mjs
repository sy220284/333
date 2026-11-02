import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const text=readFileSync(resolve(root,'src/screens/Doctor.tsx'),'utf8')

test('Doctor应是可维护的原始TSX，而非React编译缓存展开结果',()=>{
  assert.match(text,/export function Doctor\(\{ onDone \}: Props\)/)
  assert.match(text,/getDoctorDiagnostic\(\)/)
  assert.match(text,/useAppState\(s => s\.agentDefinitions\)/)
  assert.doesNotMatch(text,/react\/compiler-runtime/)
  assert.doesNotMatch(text,/react\.memo_cache_sentinel/)
})
test('恢复原文后继续提示被拒绝的项目遥测配置而不展示秘密值',()=>{
  assert.match(text,/getIgnoredProjectTelemetryEnvKeys\(\)/)
  assert.match(text,/ignoredTelemetryKeys\.slice\(0, 5\)/)
  assert.match(text,/Project telemetry settings ignored/)
  assert.match(text,/Their values are never displayed/)
})
