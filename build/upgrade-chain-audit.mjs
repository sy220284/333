import assert from 'node:assert/strict'
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)))
const read=path=>JSON.parse(readFileSync(resolve(ROOT,path),'utf8'))
const TARGET=read('docs/upgrade/m1-evidence/target-release.json')
const CLOUD_EXTERNAL=new Set(['C08','C13','C14','C15','C20'])
const SHA=/^[0-9a-f]{40}$/
const ISO=/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/
const ACTION=/^https:\/\/github\.com\/sy220284\/333\/actions\/runs\/\d+$/
const isFilled=value=>typeof value==='string'&&value.trim().length>0

function validateReport(report,label,exists) {
  assert.ok(isFilled(report)&&report.startsWith('docs/upgrade/'),label+' missing evidence path')
  assert.ok(exists(report),label+' missing report: '+report)
}

export function auditImplementation(manifest,coverage,signoffs,
  exists=path=>existsSync(resolve(ROOT,path))) {
  assert.equal(manifest.target_version,TARGET.target_version)
  assert.equal(coverage.target_version,TARGET.target_version)
  assert.equal(signoffs.target_version,TARGET.target_version)
  assert.equal(manifest.layers.length,6)
  assert.equal(manifest.routes.length,20)
  assert.equal(coverage.counts.tasks,6)
  assert.equal(coverage.counts.chains,20)
  assert.ok(Array.isArray(signoffs.chains))
  const routeIds=new Set(manifest.routes.map(r=>r.id))
  const accepted=new Map()
  for(const proof of signoffs.chains) {
    assert.ok(routeIds.has(proof.id),'unknown chain '+proof.id)
    assert.ok(!accepted.has(proof.id),'duplicate chain '+proof.id)
    assert.equal(proof.status,'VERIFIED',proof.id+' must have confirmed signoff')
    assert.equal(proof.official?.executable_sha256,TARGET.verified_x64_sha256,
      proof.id+' must use official 2.1.317 x64')
    assert.ok(isFilled(proof.official?.source_anchor),proof.id+' missing official function anchor')
    assert.equal(proof.official.result,'PASS')
    validateReport(proof.official.report,proof.id+' official',exists)
    assert.match(proof.candidate?.commit_sha??'',SHA,proof.id+' missing candidate commit')
    assert.match(proof.candidate?.ci_run??'',ACTION,proof.id+' missing CI run')
    assert.equal(proof.candidate.result,'PASS')
    assert.ok(Array.isArray(proof.candidate.source_paths)&&proof.candidate.source_paths.length,
      proof.id+' missing code implementation')
    for(const p of proof.candidate.source_paths) {
      assert.ok(p.startsWith('src/')||p.startsWith('build/'),proof.id+' unexpected source')
      assert.ok(exists(p),proof.id+' missing consumer: '+p)
    }
    validateReport(proof.candidate.report,proof.id+' rebuilt',exists)
    assert.equal(proof.parity?.result,'PASS',proof.id+' missing x64 parity')
    validateReport(proof.parity.report,proof.id+' parity',exists)
    assert.ok(proof.parity.positive_cases?.length&&proof.parity.negative_cases?.length&&
      proof.parity.semantic_checks?.length,proof.id+' incomplete success/failure/semantic cases')
    assert.equal(new Set([proof.official.report,proof.candidate.report,proof.parity.report]).size,3,
      proof.id+' evidence files must be independent')
    if(CLOUD_EXTERNAL.has(proof.id)){
      assert.equal(proof.external_host?.result,'PASS',proof.id+' external host not verified')
      validateReport(proof.external_host.report,proof.id+' external service',exists)
    }
    assert.match(proof.review?.signed_at??'',ISO,proof.id+' review timestamp')
    assert.ok(isFilled(proof.review?.reviewer),proof.id+' reviewer missing')
    accepted.set(proof.id,proof)
  }
  const chains=manifest.routes.map(route=>({id:route.id,layer:route.layer,name:route.name,
    status:accepted.has(route.id)?'VERIFIED':'PENDING_SOURCE_BINARY_E2E'}))
  const closed=new Set()
  const tasks=manifest.layers.map(layer=>{
    const allChains=layer.chain_ids.every(id=>accepted.has(id))
    const predecessors=layer.requires.every(id=>closed.has(id))
    const done=allChains&&predecessors
    if(done)closed.add(layer.id)
    return {id:layer.id,name:layer.title,chain_total:layer.chain_ids.length,
      verified_chains:layer.chain_ids.filter(id=>accepted.has(id)).length,
      requires:layer.requires,status:done?'VERIFIED':'PENDING'}
  })
  return {schema:1,target_version:manifest.target_version,
    counts:{layers:tasks.length,chains:chains.length,verified_chains:accepted.size,closed_layers:closed.size},
    tasks,chains,all_verified:closed.size===6&&accepted.size===20,
    note:'六层实施证据与366更新专项独立；来源定位、静态测试或单点修复不触发签收'}
}
export const loadAudit=()=>auditImplementation(
  read('docs/upgrade/2.1.317-六层完整功能链路.json'),
  read('docs/upgrade/upgrade-coverage.json'),
  read('docs/upgrade/2.1.317-功能链路签收.json'))
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=loadAudit()
  const i=process.argv.indexOf('--report')
  if(i>=0){
    assert.ok(process.argv[i+1])
    const dest=resolve(process.argv[i+1])
    mkdirSync(dirname(dest),{recursive:true})
    writeFileSync(dest,JSON.stringify(report,null,2)+'\n')
  }
  if(process.argv.includes('--require-closed')) assert.ok(report.all_verified,
    '2.1.317 六层20条功能链尚未具备完整源码、语义和运行验收证据')
  console.log(JSON.stringify(report.counts))
}
