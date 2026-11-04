import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import {test} from 'node:test'
import {buildCoverage,verifyCoverageSnapshot} from '../build/upgrade-coverage.mjs'

const docs=new URL('../docs/upgrade/',import.meta.url)
const read=name=>JSON.parse(readFileSync(new URL(name,docs),'utf8'))

test('六层任务和20条完整功能链逐一覆盖，覆盖快照与源数据一致',()=>{
  assert.deepEqual(verifyCoverageSnapshot(),{features:102,scenarios:84,tasks:6,chains:20})
  const manifest=read('2.1.317-六层完整功能链路.json')
  const coverage=buildCoverage()
  assert.deepEqual(coverage.tasks.map(t=>t.id),['M1','M2','M3','M4','M5','M6'])
  assert.deepEqual(coverage.tasks.map(t=>t.routes.length),[1,3,4,2,5,5])
  assert.deepEqual(coverage.chains.map(x=>x.id).sort(),Array.from({length:20},(_,i)=>'C'+String(i+1).padStart(2,'0')))
  assert.ok(coverage.chains.every(c=>c.layer==='M'+(manifest.routes.find(x=>x.id===c.id).layer_index+1)))
  assert.equal(new Set(coverage.features.map(f=>f.id)).size,102)
  assert.ok(coverage.features.every(f=>f.tasks.length===1 && f.scenarios.length && f.status==='UNVERIFIED'))
  assert.ok(coverage.scenarios.every(s=>s.features.length))
  assert.equal(manifest.independent_update_tracking.scope,'SEPARATE')
})

test('六层方案具有独立功能源和验收门禁，不再消费十张卡内容',()=>{
  for(const p of ['2.1.317-任务责任表.json','milestone-feature-map.json','M1-执行与关单状态.md']){
    assert.equal(existsSync(new URL(p,docs)),false,'obsolete task file: '+p)
  }
  const source=readFileSync(new URL('../build/upgrade-coverage.mjs',import.meta.url),'utf8')
  assert.doesNotMatch(source,/366项功能链路分组矩阵|v4-功能任务责任表|M10/)
  const manifest=read('2.1.317-六层完整功能链路.json')
  assert.ok(manifest.routes.every(r=>r.implementation_strategy.length>=4&&r.required_semantics.length>=6))
  const coverage=buildCoverage()
  assert.ok(coverage.tasks.every(t=>t.routes.length>0))
})
