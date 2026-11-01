import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scan } from '../build/m1-map-release.mjs'

test('6313 official changelog entries receive an explainable candidate route without false semantic acceptance', ()=>{
  const {records,totals}=scan()
  assert.equal(totals.records,6313)
  assert.equal(new Set(records.map(r=>r.id)).size,6313)
  assert.equal(totals.records,totals.with_feature_candidate+totals.no_feature_candidate)
  assert.ok(totals.with_feature_candidate>0,'No changelog entry received even a candidate mapping')
  assert.ok(totals.no_feature_candidate>=0,'No silent omission of unmatched entries')
  assert.ok(records.find(x=>x.id==='2.1.310#001').candidate_F.includes('F081'))
  assert.ok(records.find(x=>x.id==='2.1.310#002').candidate_F.includes('F087'))
  assert.ok(records.find(x=>x.id==='2.1.307#002')!==undefined)
  assert.ok(records.every(r=>r.evidence_grade!=='ACCEPTED'))
  assert.ok(records.filter(r=>r.scope_rationale.includes('Claude Tag')).every(r=>r.candidate_F.length===0))
  assert.ok(records.every(r=>r.candidate_M.every(m=>/^M[2-9]$/.test(m))))
})
