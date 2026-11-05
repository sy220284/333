#!/usr/bin/env node
/**
 * Restore source-map UI sources by group with actual repository type checking.
 * Incompatible sources are recorded for porting against the reference version.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const reportPath=resolve(root,'.rebuild/governance/inline-ts-source-recovery.json')
const report=JSON.parse(readFileSync(reportPath,'utf8'))
const candidates=report.files.map(({path})=>path)
const files=new Map(candidates.map(path=>[path,readFileSync(resolve(root,path),'utf8')]))
const selected=candidates.filter(path=>{
  const baseline=execFileSync('git',['show','HEAD:'+path],{cwd:root,encoding:'utf8'})
  return baseline!==files.get(path)
})
if(selected.length===0)throw new Error('No changed inline originals to validate')
execFileSync('git',['restore','--',...selected],{cwd:root})
const accepted=[], rejected=[], attempts=[]
function verify() {
  const start=Date.now()
  const r=spawnSync(process.execPath,['tools/dev/dev.mjs','typecheck:all'],{
    cwd:root,encoding:'utf8',maxBuffer:20*1024*1024
  })
  const output=[r.stdout,r.stderr].filter(Boolean).join('\n')
  const errors=output.split('\n').filter(line=>/error TS\d+/.test(line))
  return {ok:r.status===0,seconds:+((Date.now()-start)/1000).toFixed(2),
    errors:errors.slice(0,12),errorCount:errors.length,exit:r.status,signal:r.signal}
}
const baseline=verify()
if(!baseline.ok)throw new Error('Base repository fails typecheck: '+baseline.errors.join('\n'))
function apply(paths) {
  for(const path of paths)writeFileSync(resolve(root,path),files.get(path))
}
function revert(paths) {
  if(paths.length)execFileSync('git',['restore','--',...paths],{cwd:root})
}
let checked=0
function tryGroup(group) {
  apply(group)
  const result=verify()
  checked++
  attempts.push({index:checked,files:group.length,...result})
  if(result.ok){
    accepted.push(...group)
    console.log('[恢复批次通过]',JSON.stringify({attempt:checked,files:group.length,accepted:accepted.length}))
    return
  }
  revert(group)
  if(group.length===1) {
    rejected.push({path:group[0],diagnostics:result.errors,errorCount:result.errorCount})
    console.log('[源码组件待移植]',JSON.stringify({path:group[0],diagnostics:result.errors.slice(0,3)}))
    return
  }
  const mid=Math.floor(group.length/2)
  tryGroup(group.slice(0,mid))
  tryGroup(group.slice(mid))
}
const groupSize=Number(process.env.INLINE_RESTORE_GROUP_SIZE||32)
if (!Number.isInteger(groupSize)||groupSize<1||groupSize>256)throw new Error('Invalid group size')
for(let i=0;i<selected.length;i+=groupSize)tryGroup(selected.slice(i,i+groupSize))
const final=verify()
if(!final.ok)throw new Error('Accepted source set fails final typecheck: '+final.errors.join('\n'))
const result={
  originalCandidates:report.candidates, changed:selected.length,
  accepted:accepted.length, rejected:rejected.length, attempts:checked,
  acceptedPaths:accepted, rejectedDetails:rejected, diagnosticRuns:attempts,
}
const out=resolve(root,'.rebuild/governance/inline-ts-compatible-report.json')
mkdirSync(dirname(out),{recursive:true})
writeFileSync(out,JSON.stringify(result,null,2)+'\n')
console.log('[TSX源代码兼容恢复验收]',JSON.stringify({
  candidates:result.changed,accepted:result.accepted,
  rejected:result.rejected,attempts:checked,remainingReport:out
}))
