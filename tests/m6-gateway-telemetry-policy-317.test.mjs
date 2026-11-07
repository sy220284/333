import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { validateGatewayConfig317 } from '../src/cli/gateway/gatewayConfig317.mjs'
import { forwardGatewayTelemetry317 } from '../src/cli/gateway/gatewayForward317.mjs'

function config(telemetry) {
  return validateGatewayConfig317({
    listen: { host: '127.0.0.1', port: 49175 },
    store: { postgres_url: 'postgres://127.0.0.1/gateway' },
    session: { jwt_secret: 'local-integration-test-secret-1234567890' },
    oidc: { issuer: 'https://idp.example.test', client_id: 'test' },
    upstreams: [{ name: 'main', provider: 'anthropic', auth: { api_key: 'test-secret' }, models: ['test-model'] }],
    ...(telemetry === undefined ? {} : { telemetry }),
  })
}
function request(path, body) {
  return new Request('http://127.0.0.1:49175' + path, {
    method: 'POST', body, headers: { 'content-type': 'application/x-protobuf' },
  })
}
function context(settings, audit = async () => {}) {
  return { config: settings, identity: { sub: 'test-employee' }, audit }
}

test('企业网关默认无外部遥测目标，日志指标追踪都就地接收', async () => {
  const settings = config()
  assert.deepEqual(settings.telemetry.forward_to, [])
  for (const path of ['/v1/logs', '/v1/metrics', '/v1/traces']) {
    const response = await forwardGatewayTelemetry317(request(path, 'private-value'), context(settings))
    assert.equal(response.status, 200, path)
  }
})

test('只有显式配置对应类型的接收端才转发原始数据', async () => {
  const received = []
  const server = createServer(async (req, res) => {
    const data = []
    for await (const part of req) data.push(part)
    received.push({
      path: req.url,
      type: req.headers['content-type'],
      payload: Buffer.concat(data).toString('utf8'),
    })
    res.writeHead(204)
    res.end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const endpoint = 'http://127.0.0.1:' + server.address().port + '/ingest'
    const settings = config({ forward_to: [{ url: endpoint, logs: true, metrics: false, traces: false }] })
    assert.equal((await forwardGatewayTelemetry317(
      request('/v1/logs', 'sensitive-log-body'), context(settings),
    )).status, 200)
    assert.deepEqual(received, [{ path: '/ingest', type: 'application/x-protobuf', payload: 'sensitive-log-body' }])
    assert.equal((await forwardGatewayTelemetry317(
      request('/v1/metrics', 'private-metrics'), context(settings),
    )).status, 200)
    assert.equal(received.length, 1, '没有启用的指标类型不能发送到外部')
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('企业网关遥测转发失败必须显式返回错误并记录审计', async () => {
  const server = createServer((_req, res) => { res.writeHead(503); res.end('sink unavailable') })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const events = []
    const endpoint = 'http://127.0.0.1:' + server.address().port + '/ingest'
    const settings = config({ forward_to: [{ url: endpoint, traces: true }] })
    const response = await forwardGatewayTelemetry317(
      request('/v1/traces', 'trace-body'),
      context(settings, async (...args) => { events.push(args) }),
    )
    assert.equal(response.status, 502)
    assert.equal(events.length, 1)
    assert.equal(events[0][0], 'telemetry.forward_failure')
    assert.equal(events[0][1], 'test-employee')
    assert.deepEqual(events[0][3], { stream: '/v1/traces', failed: 1 })
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
