import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)))
const read=p=>JSON.parse(readFileSync(resolve(ROOT,'docs/upgrade',p),'utf8'))
const SNAPSHOT=resolve(ROOT,'docs/upgrade/upgrade-coverage.json')
const ids=(prefix,start,end,n)=>Array.from({length:end-start+1},(_,i)=>prefix+String(i+start).padStart(n,'0'))
export function buildCoverage(){
 const target=read('m1-evidence/target-release.json')
 const baseline=read('2.1.317-功能与场景源数据.json')
 const plan=read('2.1.317-六层完整功能链路.json')
 assert.equal(target.target_version,'2.1.317')
 assert.equal(baseline.target_version,target.target_version)
 assert.equal(plan.target_version,target.target_version)
 assert.deepEqual(plan.layers.map(x=>x.id),ids('M',1,6,1))
 assert.deepEqual(plan.routes.map(x=>x.id).sort(),ids('C',1,20,2))
 assert.equal(baseline.features.length,137)
 assert.equal(baseline.scenarios.length,137)
 assert.deepEqual(baseline.features.map(x=>x.id),ids('F',1,137,3))
 assert.deepEqual(baseline.scenarios.filter(x=>x.id.startsWith('E')).map(x=>x.id),ids('E',1,110,2))
 assert.deepEqual(baseline.scenarios.filter(x=>x.id.startsWith('L')).map(x=>x.id),ids('L',1,27,2))
 assert.equal(new Set(plan.layers.flatMap(x=>x.chain_ids)).size,20)
 const mapping=new Map()
 for(const r of plan.routes){
   assert.ok(plan.layers.some(l=>l.id===r.layer&&l.chain_ids.includes(r.id)),r.id+'无有效责任层')
   assert.ok(r.source_candidates.length>0,r.id+'缺少代码定位')
   for(const p of r.source_candidates) assert.ok(existsSync(resolve(ROOT,p)),r.id+'源码文件不存在：'+p)
   for(const id of r.baseline_feature_ids){
     assert.ok(!mapping.has(id),id+'出现重复主责任链')
     mapping.set(id,r)
   }
 }
 assert.deepEqual([...mapping.keys()].sort(),ids('F',1,137,3))
 const features=baseline.features.map(f=>{
   const chain=mapping.get(f.id)
   const scenarios=baseline.scenarios.filter(s=>s.features.includes(f.id)).map(s=>s.id)
   assert.ok(scenarios.length>0,f.id+'缺少对应运行场景')
   return {id:f.id,title:f.title,chain:chain.id,tasks:[chain.layer],scenarios,status:'PENDING_ALIGNMENT'}
 })
 for(const s of baseline.scenarios){
   assert.ok(s.features.length,s.id+'未绑定功能')
   for(const id of s.features)assert.ok(mapping.has(id),s.id+'未知关联：'+id)
 }
 const tasks=plan.layers.map(l=>({id:l.id,name:l.title,layer_index:l.index,requires:l.requires,routes:l.chain_ids,features:features.filter(f=>f.tasks[0]===l.id).map(f=>f.id)}))
 const chains=plan.routes.map(r=>({id:r.id,name:r.name,layer:r.layer,features:r.baseline_feature_ids,status:r.status}))
 return {schema:3,target_version:target.target_version,baseline_version:'2.1.88',status_semantics:'直接对照官方317代码和x64行为升级，六层20链，已梳理137功能/137场景；完成进度以源码与实际测试为准。',counts:{features:features.length,scenarios:baseline.scenarios.length,tasks:6,chains:20},tasks,chains,features,scenarios:baseline.scenarios}
}
export function verifyCoverageSnapshot(){
 const target=buildCoverage()
 const actual=JSON.parse(readFileSync(SNAPSHOT,'utf8'))
 assert.deepEqual(actual,target,'新版功能清单未同步：node build/upgrade-coverage.mjs --write')
 return target.counts
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.includes('--write')){
  const out=buildCoverage()
  writeFileSync(SNAPSHOT,JSON.stringify(out,null,2)+'\n')
  console.log('Updated 2.1.317: '+JSON.stringify(out.counts))
 }else console.log('Checked 2.1.317: '+JSON.stringify(verifyCoverageSnapshot()))
}
