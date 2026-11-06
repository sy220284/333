import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('废弃 OTLP、BigQuery 及组织指标上报模块已清除', () => {
  for (const path of [
    'src/utils/telemetry/bigqueryExporter.ts',
    'src/services/api/metricsOptOut.ts',
    'src/utils/telemetry/otlpTimeout.ts',
    'src/utils/telemetry/otlpTimeout.mjs',
    'src/utils/telemetry/otlpTimeout.d.mts',
    'src/services/settingsSync/index.ts',
    'src/services/settingsSync/types.ts',
    'src/services/teamMemorySync/index.ts',
    'src/services/teamMemorySync/watcher.ts',
    'src/services/teamMemorySync/types.ts',
  ]) assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, path)
})

test('遥测初始化只有本地写入器，不再具备远程导出路径', () => {
  const runtime = source('src/utils/telemetry/instrumentation.ts')
  assert.match(runtime, /new LocalMetricsExporter\(\)/)
  assert.match(runtime, /flushLocalDiagnostics\(\)/)
  assert.doesNotMatch(runtime, /OTLP|BigQuery|https?:\/\/|axios|fetch\s*\(/)
  const exporter = source('src/utils/telemetry/localMetricsExporter.ts')
  assert.match(exporter, /recordLocalEvent\(/)
  assert.doesNotMatch(exporter, /https?:\/\/|axios|fetch\s*\(/)
  const detailed = source('src/utils/telemetry/betaSessionTracing.ts')
  assert.match(detailed, /isBetaTracingEnabled\(\): boolean \{\s*return false/)
  assert.doesNotMatch(detailed, /system_prompt_hash|new_context:|logOTelEvent|BETA_TRACING_ENDPOINT/)
})

test('普通模型和辅助 API 不再自动附加设备账户与会话追踪字段', () => {
  for (const path of [
    'src/services/api/claude.ts',
    'src/utils/sideQuery.ts',
    'src/services/tokenEstimation.ts',
    'src/services/claudeAiLimits.ts',
  ]) {
    const src = source(path)
    assert.doesNotMatch(src, /getAPIMetadata|metadata:\s*getAPIMetadata|device_id:\s*getOrCreateUserID/)
  }
  const client = source('src/services/api/client.ts')
  assert.doesNotMatch(client, /X-Claude-Code-Session-Id|['"]x-client-app['"]|x-client-request-id|CLIENT_REQUEST_ID_HEADER/)
  assert.match(client, /stripSdkDiagnosticHeaders\(headers\)/)
  assert.doesNotMatch(source('src/services/api/logging.ts'), /clientRequestId|x-client-request-id/)
})

test('设置与记忆依赖本地目录，云端同步入口不再接入应用', () => {
  for (const path of [
    'src/main.tsx',
    'src/cli/print.ts',
    'src/commands/reload-plugins/reload-plugins.ts',
    'src/setup.ts',
    'src/utils/sessionFileAccessHooks.ts',
  ]) {
    assert.doesNotMatch(source(path), /services\/(?:settingsSync|teamMemorySync)\/|uploadUserSettingsInBackground|downloadUserSettings\(|redownloadUserSettings\(|notifyTeamMemoryWrite\(/, path)
  }
  assert.equal(existsSync(new URL('../src/memdir/teamMemSecretGuard.ts', import.meta.url)), true)
})
