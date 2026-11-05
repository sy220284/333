import assert from 'node:assert/strict'
import {test} from 'node:test'
import {buildCoverage,verifyCoverageSnapshot} from '../build/upgrade-coverage.mjs'
test('2.1.317新版137项功能、137个场景、M1–M6与20条链全部有归属',()=>{
 const c=buildCoverage()
 assert.deepEqual(verifyCoverageSnapshot(),{features:137,scenarios:137,tasks:6,chains:20})
 assert.equal(new Set(c.tasks.flatMap(x=>x.routes)).size,20)
 assert.equal(new Set(c.tasks.flatMap(x=>x.features)).size,137)
 assert.ok(c.features.every(x=>x.scenarios.length>0&&x.tasks.length===1))
 assert.equal(c.scenarios.filter(x=>x.id.startsWith('E')).length,110)
 assert.equal(c.scenarios.filter(x=>x.id.startsWith('L')).length,27)
})
