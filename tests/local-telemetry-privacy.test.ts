import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { ExportResultCode } from '@opentelemetry/core'

const temporaryHome = mkdtempSync(join(tmpdir(), 'local-telemetry-'))
const previousHome = process.env.HOME
const previousUserProfile = process.env.USERPROFILE
const previousPrivacy = process.env.DISABLE_TELEMETRY
const previousNetworkPrivacy = process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
process.env.HOME = temporaryHome
process.env.USERPROFILE = temporaryHome
delete process.env.DISABLE_TELEMETRY
delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC

const { recordLocalEvent, flushLocalDiagnostics, getLocalDiagnosticsFilePath } =
  await import('../src/services/analytics/localDiagnostics.ts')
const { logOTelEvent, redactIfDisabled } = await import('../src/utils/telemetry/events.ts')
const { LocalMetricsExporter } = await import('../src/utils/telemetry/localMetricsExporter.ts')
const { getTelemetryAttributes } = await import('../src/utils/telemetryAttributes.ts')

after(() => {
  if (previousHome === undefined) delete process.env.HOME
  else process.env.HOME = previousHome
  if (previousUserProfile === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = previousUserProfile
  if (previousPrivacy === undefined) delete process.env.DISABLE_TELEMETRY
  else process.env.DISABLE_TELEMETRY = previousPrivacy
  if (previousNetworkPrivacy === undefined) delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
  else process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = previousNetworkPrivacy
  rmSync(temporaryHome, { recursive: true, force: true })
})

test('本地日志保留安全数值指标，不会保存提示词、身份与原始工具内容', async () => {
  const secret = 'SECRET_USER_PROMPT_PRIVATE_42'
  assert.equal(redactIfDisabled(secret), '<REDACTED>')
  assert.deepEqual(getTelemetryAttributes(), {})
  await recordLocalEvent('task_complete', {
    success: true, duration_ms: 120, unsafe: secret, filePath: '/private/location',
  })
  await logOTelEvent('user_prompt', {
    prompt: secret, user_id: '12345', duration_ms: '12.5', status: '200',
  })
  await flushLocalDiagnostics()
  const file = getLocalDiagnosticsFilePath()
  const contents = readFileSync(file, 'utf8')
  assert.match(contents, /task_complete/)
  assert.match(contents, /otel_user_prompt/)
  assert.match(contents, /duration_ms/)
  assert.doesNotMatch(contents, /SECRET_USER_PROMPT|private\/location|user_id|12345/)
  if (process.platform !== 'win32') {
    assert.equal(statSync(file).mode & 0o077, 0)
  }
})

test('模型性能计数安全写入本地，没有额外网络依赖', async () => {
  const exporter = new LocalMetricsExporter()
  const fake = {
    scopeMetrics: [{
      metrics: [{
        descriptor: { name: 'runtime.tokens' },
        dataPoints: [{ value: 12, attributes: { 'user.email': 'private@example.com' } }],
      }],
    }],
  }
  const result = await new Promise<{ code: number; error?: Error }>(resolve => {
    void exporter.export(fake as never, resolve)
  })
  assert.equal(result.code, ExportResultCode.SUCCESS)
  await flushLocalDiagnostics()
  const contents = readFileSync(getLocalDiagnosticsFilePath(), 'utf8')
  assert.match(contents, /metric_runtime_tokens/)
  assert.doesNotMatch(contents, /private@example.com|user.email/)
})

test('关闭遥测后本地事件和日志保持不变', async () => {
  await flushLocalDiagnostics()
  const file = getLocalDiagnosticsFilePath()
  const initial = readFileSync(file, 'utf8')
  process.env.DISABLE_TELEMETRY = '1'
  try {
    await recordLocalEvent('must_not_be_recorded', { value: 5 })
    await logOTelEvent('must_not_be_logged', { duration_ms: '12' })
    await flushLocalDiagnostics()
    assert.equal(readFileSync(file, 'utf8'), initial)
  } finally {
    delete process.env.DISABLE_TELEMETRY
  }
})

test('DO_NOT_TRACK 禁用本地收集，废弃详细追踪配置无法重新开启服务器上传', async () => {
  const file = getLocalDiagnosticsFilePath()
  await flushLocalDiagnostics()
  const initial = readFileSync(file, 'utf8')
  const { isBetaTracingEnabled } = await import('../src/utils/telemetry/betaSessionTracing.ts')
  process.env.DO_NOT_TRACK = '1'
  process.env.ENABLE_BETA_TRACING_DETAILED = '1'
  process.env.BETA_TRACING_ENDPOINT = 'https://deprecated-collector.invalid'
  try {
    await logOTelEvent('must_not_be_logged_with_dnt', { duration_ms: '99' })
    await flushLocalDiagnostics()
    assert.equal(readFileSync(file, 'utf8'), initial)
    assert.equal(isBetaTracingEnabled(), false)
  } finally {
    delete process.env.DO_NOT_TRACK
    delete process.env.ENABLE_BETA_TRACING_DETAILED
    delete process.env.BETA_TRACING_ENDPOINT
  }
})
