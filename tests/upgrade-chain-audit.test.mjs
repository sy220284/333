import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {auditImplementation,loadAudit} from '../build/upgrade-chain-audit.mjs'
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'))
const ctx=()=>({
  manifest:read('docs/upgrade/2.1.317-六层完整功能链路.json'),
  coverage:read('docs/upgrade/upgrade-coverage.json'),
  signoffs:read('docs/upgrade/2.1.317-功能链路签收.json')
})
test('六层的全部20条链路都必须独立签收，空签收不得误报通过',()=>{
  const result=loadAudit()
  assert.equal(result.counts.layers,6)
  assert.equal(result.counts.chains,20)
  assert.equal(result.all_verified,false)
  assert.equal(result.counts.verified_chains,0)
  assert.equal(result.counts.closed_layers,0)
  assert.ok(result.tasks.every(t=>t.status==='PENDING'))
})
test('伪造的链路完成状态和错误原版哈希被拒绝',()=>{
  const x=ctx()
  x.signoffs.chains=[{id:'C19',status:'VERIFIED',official:{executable_sha256:'wrong'}}]
  assert.throws(()=>auditImplementation(x.manifest,x.coverage,x.signoffs),/official 2.1.317 x64/)
})
test('未知及重复链路均不能签收',()=>{
  const x=ctx()
  x.signoffs.chains=[{id:'C21',status:'VERIFIED'}]
  assert.throws(()=>auditImplementation(x.manifest,x.coverage,x.signoffs),/unknown chain/)
  x.signoffs.chains=[{id:'C01',status:'UNVERIFIED'}]
  assert.throws(()=>auditImplementation(x.manifest,x.coverage,x.signoffs),/confirmed signoff/)
})
