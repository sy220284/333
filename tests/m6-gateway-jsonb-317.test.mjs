import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeGatewayClaims317 } from '../src/cli/gateway/gatewayStore317.mjs'

test('317 网关: Bun.SQL 返回 JSONB 原始文本时正确恢复身份声明', () => {
  const claims = decodeGatewayClaims317('{"sub":"employee-317","groups":["engineers"],"email":"e@example.invalid"}')
  assert.deepEqual(claims, {
    sub: 'employee-317', groups: ['engineers'], email: 'e@example.invalid',
  })
})

test('317 网关: 驱动已解码 JSONB 时保留对象不重复转换', () => {
  const row = { sub: 'employee-317', groups: ['admins'] }
  assert.equal(decodeGatewayClaims317(row), row)
})

test('317 网关: 异常授权记录明确报错，避免签发身份损坏的 Token', () => {
  for (const row of ['null', '[]', '{"groups":[]}', '{"sub":123}', null, []]) {
    assert.throws(() => decodeGatewayClaims317(row), /invalid authorization claims/)
  }
  assert.throws(() => decodeGatewayClaims317('{invalid'), SyntaxError)
})
