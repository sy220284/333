import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { resolveOTLPTimeoutMs } from '../src/utils/telemetry/otlpTimeout.mjs'

test('2.1.317 OTLP exports default to 10 seconds and cap at 30 seconds', () => {
  assert.equal(resolveOTLPTimeoutMs(undefined), 10000)
  assert.equal(resolveOTLPTimeoutMs(''), 10000)
  assert.equal(resolveOTLPTimeoutMs('1000'), 1000)
  assert.equal(resolveOTLPTimeoutMs('30000'), 30000)
  assert.equal(resolveOTLPTimeoutMs('45000'), 30000)
})
test('invalid OTLP timeouts report configuration errors', () => {
  for (const raw of ['0', '-1', 'abc', '1000ms', '1.5', '99999999999999999999999']) {
    assert.throws(() => resolveOTLPTimeoutMs(raw), RangeError, raw)
  }
})
test('all OTLP metric, log and trace exporters inherit the timeout boundary', () => {
  const code = readFileSync(new URL('../src/utils/telemetry/instrumentation.ts', import.meta.url), 'utf8')
  assert.match(code, /timeoutMillis: resolveOTLPTimeoutMs\(process\.env\.OTEL_EXPORTER_OTLP_TIMEOUT\)/)
  for (const kind of ['Metric','Log','Trace']) {
    assert.match(code, new RegExp(`new OTLP${kind}Exporter\\(\\{ timeoutMillis: resolveOTLPTimeoutMs`))
  }
})
