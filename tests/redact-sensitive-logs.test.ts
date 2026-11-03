import { describe,expect,test } from 'bun:test'
import { redactSensitiveInfo } from '../src/utils/redactSensitiveInfo.js'
describe('日志与反馈共用敏感信息遮蔽规则',()=>{
  test('隐藏密钥、授权令牌与密码字段',()=>{
    const secret=[`sk-ant-${'a'.repeat(32)}`,'Authorization: Bearer superSecretToken','x-api-key: customer-secret','password=letmein',`AKIA${'0'.repeat(16)}`].join('\n')
    const safe=redactSensitiveInfo(secret)
    for(const value of ['superSecretToken','customer-secret','letmein',`AKIA${'0'.repeat(16)}`,`sk-ant-${'a'.repeat(32)}`])expect(safe.includes(value)).toBe(false)
    expect(safe).toContain('[REDACTED')
  })
  test('保留公开错误定位信息',()=>{
    expect(redactSensitiveInfo('TypeError at src/query.ts:42')).toBe('TypeError at src/query.ts:42')
  })
})
