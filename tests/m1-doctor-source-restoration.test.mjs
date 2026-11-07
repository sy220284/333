import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('诊断能力保留在共享服务与纯文本 CLI，旧终端医生组件已清理', () => {
  const diagnostic = read('src/utils/doctorDiagnostic.ts')
  const main = read('src/main.tsx')
  const gateway = read('src/services/desktop/gateway.ts')
  const panel = read('desktop/src/components/layout/LocalMaintenance.tsx')
  assert.match(diagnostic, /export async function getDoctorDiagnostic/)
  assert.match(main, /program.command\('doctor'\)/)
  assert.match(main, /--json/)
  assert.match(gateway, /case 'system.diagnostics'/)
  assert.match(panel, /system.diagnostics/)
  assert.equal(existsSync(new URL('../src/screens/Doctor.tsx', import.meta.url)), false)
  assert.equal(existsSync(new URL('../src/commands/doctor/doctor.tsx', import.meta.url)), false)
})

test('旧 Claude 专属长期授权向导退出 CLI，模型凭证仍由桌面独立配置', () => {
  assert.doesNotMatch(read('src/main.tsx'), /program.command\('setup-token'\)/)
  assert.match(read('desktop/src/App.tsx'), /credentials.set/)
})
