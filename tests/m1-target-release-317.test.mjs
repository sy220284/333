import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import './m1-native-run-skills-317.test.mjs'
import {buildCoverage,verifyCoverageSnapshot} from '../build/upgrade-coverage.mjs'
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'))
test('新版2.1.317 六层任务与当前137功能/137场景完整归属',()=>{
 const target=read('docs/upgrade/m1-evidence/target-release.json')
 const baseline=read('docs/upgrade/2.1.317-功能与场景源数据.json')
 const c=buildCoverage()
 assert.equal(target.target_version,'2.1.317')
 assert.equal(target.feature_acceptance_target,137)
 assert.equal(target.scenario_acceptance_target,137)
 assert.equal(baseline.target_version,target.target_version)
 assert.deepEqual(c.counts,{features:137,scenarios:137,tasks:6,chains:20})
 assert.deepEqual(c.tasks.map(x=>x.id),['M1','M2','M3','M4','M5','M6'])
 assert.equal(new Set(c.features.map(x=>x.id)).size,137)
 assert.equal(new Set(c.scenarios.map(x=>x.id)).size,137)
 assert.equal(c.features.filter(x=>x.status==='PENDING_ALIGNMENT').length,137)
 assert.deepEqual(verifyCoverageSnapshot(),c.counts)
 assert.match(target.verified_x64_sha256,/^[a-f0-9]{64}$/)
})
