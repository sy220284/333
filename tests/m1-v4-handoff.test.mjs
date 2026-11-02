import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildHandoff } from '../build/m1-v4-handoff.mjs'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const read=path=>JSON.parse(readFileSync(resolve(root,path),'utf8'))
const mapping=read('docs/upgrade/m1-evidence/v4-首批实测差异与源码修改责任.json')
const coverage=read('docs/upgrade/upgrade-coverage.json')
const actualIds=[
  'version','help','mcp_help','plugin_help','mcp_list_empty','plugin_list_empty',
  'invalid_output','invalid_permission','json_without_login','stream_without_login',
]
function reference() {
  const failures=new Set(mapping.case_mapping.map(x=>x.id))
  const original=actualIds.map(id=>({id,pass:true,exit_code:id.startsWith('invalid_')?1:0,contract:id}))
  const candidate=actualIds.map(id=>({id,pass:!failures.has(id),exit_code:id.startsWith('invalid_')?1:0,contract:id}))
  return {reference_sha256:mapping.reference_sha256,
    scope:'OFFLINE_UNAUTHENTICATED_CLI_CONTRACTS_ONLY',
    reference:{passed:10,total:10,cases:original},
    candidate:{passed:4,total:10,cases:candidate},
  }
}

test('v4从10项实际运行数据生成6个有源码、责任和场景的开发交接',()=>{
  const out=buildHandoff(reference(),mapping,coverage,root)
  assert.equal(out.target_reference_passed,10)
  assert.equal(out.candidate_baseline_passed,4)
  assert.equal(out.confirmed_differences,6)
  assert.deepEqual(out.development_owners,['M5','M6'])
  assert.ok(out.differences.every(x=>x.state==='DIFFERENCE_CONFIRMED_SOURCE_CHANGE_REQUIRED'))
  assert.ok(out.differences.every(x=>x.implementation_commits.length===0 && !x.accepted))
  assert.equal(out.verifiedBaseline.length,4)
})
test('新版基准自身失败就拒绝生成所谓确定缺口',()=>{
  const data=reference();data.reference.cases[0].pass=false
  assert.throws(()=>buildHandoff(data,mapping,coverage,root),/原版基准异常/)
})
test('新增实际缺口无旧代码责任时直接失败',()=>{
  const data=reference()
  data.candidate.cases.find(x=>x.id==='mcp_help').pass=false
  assert.throws(()=>buildHandoff(data,mapping,coverage,root),/缺少开发责任/)
})
test('缺口引用不存在的旧源码函数时拒绝错误交接',()=>{
  const records=structuredClone(mapping)
  records.case_mapping[0].old_sources[0].symbol='__no_such_symbol__'
  assert.throws(()=>buildHandoff(reference(),records,coverage,root),/旧源码函数或消费者已变化/)
})
test('旧版基准哈希变化时拒绝错误版本对照',()=>{
  const data=reference();data.reference_sha256='not-2.1.310'
  assert.throws(()=>buildHandoff(data,mapping,coverage,root),/原版 ELF 哈希/)
})
