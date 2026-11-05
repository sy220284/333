#!/usr/bin/env node
/**
 * Apply checker-derived exported types only when complete project typechecking
 * validates the new declarations and dependent imports. Preserve a per-file
 * rejection ledger for the remaining call-chain based manual rewrites.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync,execFileSync} from 'node:child_process'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const inferred=JSON.parse(readFileSync(resolve(root,'.rebuild/governance/export-types-inference.json'),'utf8'))
if(inferred.mode!=='apply')throw Error('Run annotate-export-signatures.mjs --apply first')
const candidates=inferred.changes.map(v=>v.path)
const rejected=[]
function check(){
  const r=spawnSync(process.execPath,['tools/dev/dev.mjs','typecheck:all'],{
    cwd:root,encoding:'utf8',maxBuffer:32*1024*1024
  })
  const log=(r.stdout??'')+'\n'+(r.stderr??'')
  const diagnostics=log.split('\n').filter(l=>/error TS\d+/.test(l))
  return {ok:r.status===0,diagnostics,exit:r.status}
}
let result=check(),attempts=1
while(!result.ok){
  const changed=candidates.filter(path=>{
    const r=spawnSync('git',['diff','--quiet','HEAD','--',path],{cwd:root})
    return r.status===1
  })
  const changedWithErrors=changed.filter(path=>result.diagnostics.some(line=>
    line.includes(path+'(')||line.includes(path.replaceAll('/','\\')+'(')))
  if(!changedWithErrors.length)throw Error('Type diagnostics may originate in dependent files: '+result.diagnostics.slice(0,30).join('\n'))
  for(const path of changedWithErrors){
    const lines=result.diagnostics.filter(line=>line.includes(path+'(')).slice(0,16)
    rejected.push({path,reason:'new-types-fail-compilation',diagnostics:lines})
    execFileSync('git',['restore','--',path],{cwd:root})
  }
  result=check();attempts++
  if(attempts>12)throw Error('Inference compilation did not converge: '+result.diagnostics.slice(0,30).join('\n'))
}
const accepted=inferred.changes.filter(x=>
  spawnSync('git',['diff','--quiet','HEAD','--',x.path],{cwd:root}).status===1)
if(!accepted.length)throw Error('No inferred type changes passed compile')
const summary={revision:process.env.GITHUB_SHA||null,
  originalCandidates:inferred.changes.length,originalAnnotations:inferred.annotations,
  acceptedFiles:accepted.length,acceptedAnnotations:accepted.reduce((n,x)=>n+x.count,0),
  rejected,attempts,acceptedPaths:accepted.map(x=>x.path)}
const out=resolve(root,'.rebuild/governance/applied-export-types.json')
mkdirSync(dirname(out),{recursive:true})
writeFileSync(out,JSON.stringify(summary,null,2)+'\n')
console.log('[真实导出类型写回]',JSON.stringify({
  files:summary.acceptedFiles,annotations:summary.acceptedAnnotations,
  rejectedFiles:summary.rejected.length,typecheckRuns:summary.attempts
}))
