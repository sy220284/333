import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reportUpgrade317 } from '../build/upgrade317-evidence-report.mjs'

test('392条原始更新全部保留，按当前产品范围归类', () => {
  const report=reportUpgrade317()
  assert.equal(report.total,392)
  assert.deepEqual(report.scope_counts,{
    RETAIN_OFFICIAL_PARITY:220,
    ADAPT_TO_LOCAL_EQUIVALENT:76,
    EXCLUDE_RETIRED_FEATURE:96,
  })
  assert.equal(report.items.length,392)
  assert.equal(new Set(report.items.map(item=>item.id)).size,392)
  assert.equal(Object.values(report.by_chain).reduce((sum,chain)=>sum+chain.total,0),392)
})

test('增量源码与专项测试记录可校验，不能直接冒充正式验收', () => {
  const report=reportUpgrade317()
  assert.equal(report.baseline_code_wired,34)
  assert.equal(report.incremental_candidates,14)
  assert.equal(report.incremental_implementation_candidates,5)
  assert.equal(report.incremental_retirement_candidates,9)
  assert.ok(report.source_and_test_candidates>=39)
  assert.equal(report.runtime_verified,0)
  assert.equal(report.formal_item_signoffs,0)
  assert.equal(report.signed_chains,0)
  assert.ok(report.items.every(item=>item.runtime_verified===false && item.formally_signed===false))
})

test('五条新增功能修复按原始链路保留，九条官方退役仅签安全边界', () => {
  const report=reportUpgrade317()
  const byId=new Map(report.items.map(item=>[item.id,item]))
  for (const id of ['2.1.311#065','2.1.317#028','2.1.317#029','2.1.317#050','2.1.317#082']) {
    const item=byId.get(id)
    assert.equal(item.current_evidence_grade,'IMPLEMENTED_PENDING_RUNTIME',id)
    assert.notEqual(item.scope,'EXCLUDE_RETIRED_FEATURE')
  }
  for (const id of ['2.1.311#001','2.1.312#001','2.1.314#002','2.1.314#003',
    '2.1.316#002','2.1.316#005','2.1.317#007','2.1.317#046','2.1.317#071']) {
    const item=byId.get(id)
    assert.equal(item.current_evidence_grade,'RETIREMENT_BOUNDARY_CODE_TEST_PRESENT',id)
    assert.equal(item.scope,'EXCLUDE_RETIRED_FEATURE')
  }
})
