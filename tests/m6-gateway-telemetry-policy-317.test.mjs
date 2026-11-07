import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { validateGatewayConfig317 } from '../src/cli/gateway/gatewayConfig317.mjs'

function config(telemetry) {
  return validateGatewayConfig317({
    listen:{host:'127.0.0.1',port:49175},
    store:{postgres_url:'postgres://127.0.0.1/gateway'},
    session:{jwt_secret:'local-test-secret-that-is-not-for-production-123456'},
    oidc:{issuer:'https://idp.example.test',client_id:'test'},
    upstreams:[{name:'main',provider:'anthropic',auth:{api_key:'fixture-secret'},models:['fixture-model']}],
    ...(telemetry===undefined?{}:{telemetry}),
  })
}
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('退休企业网关默认没有外部遥测目标',()=>{
  assert.deepEqual(config().telemetry.forward_to,[])
})

test('即使人工填写外部遥测地址，也明确拒绝原厂转发配置',()=>{
  assert.throws(()=>config({forward_to:[{
    url:'https://external.example.test/ingest',logs:true,metrics:true,traces:true,
  }]}),/已移除企业网关外部遥测转发/)
})

test('原厂Gateway无法通过正式CLI提供指标外传通道',()=>{
  const main=source('src/main.tsx')
  const cli=source('src/entrypoints/cli.tsx')
  const server=source('src/cli/gateway/gatewayServer317.ts')
  const forward=source('src/cli/gateway/gatewayForward317.ts')
  assert.doesNotMatch(main,/program\.command\(['"]gateway['"]\)/)
  assert.doesNotMatch(main,/runEnterpriseGateway317/)
  assert.doesNotMatch(cli,/args\[0\]\s*===\s*['"]self-hosted-runner['"]/)
  assert.doesNotMatch(server,/forwardGatewayTelemetry317/)
  assert.doesNotMatch(forward,/forwardGatewayTelemetry317/)
  assert.doesNotMatch(forward,/telemetry\.forward_failure/)
})
