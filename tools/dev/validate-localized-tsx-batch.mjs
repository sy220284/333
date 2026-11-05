#!/usr/bin/env node
/**
 * Execute repository-wide typechecking on safely relocalized original TSX
 * candidate files. All files are reverted before baseline and accepted only
 * after actual typechecking with the existing application call graph.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync,spawnSync} from 'node:child_process'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const report=JSON.parse(readFileSync(resolve(root,
  '.rebuild/governance/localized-original-tsx-reconstruction.json'),'utf8'))
if(report.mode!=='apply')throw Error('Run reconstruct-localized-original-tsx.mjs --apply')
const candidates=report.files.filter(x=>x.ok).map(x=>x.path)
const outputs=new Map(candidates.map(path=>[path,readFileSync(resolve(root,path),'utf8')]))
if(!candidates.length)throw Error('No localized TSX originals to verify')
execFileSync('git',['restore','--',...candidates],{cwd:root})
function check(){
  const call=spawnSync(process.execPath,['tools/dev/dev.mjs','typecheck:all'],{
    cwd:root,encoding:'utf8',maxBuffer:32*1024*1024
  })
  const log=(call.stdout??'')+'\n'+(call.stderr??'')
  return {ok:call.status===0,errors:log.split('\n').filter(x=>/error TS\d+/.test(x)).slice(0,25)}
}
const baseline=check()
if(!baseline.ok)throw Error('Current baseline typecheck fails: '+baseline.errors.join('\n'))
const rejected=[],accepted=[],checks=[]
function restore(paths){
  for(const path of paths)writeFileSync(resolve(root,path),outputs.get(path))
}
function revert(paths){
  if(paths.length)execFileSync('git',['restore','--',...paths],{cwd:root})
}
function tryGroup(paths){
  restore(paths)
  const r=check()
  checks.push({count:paths.length,ok:r.ok,errors:r.errors})
  if(r.ok){accepted.push(...paths);console.log('[中文TSX验证通过]',paths.length,accepted.length);return}
  revert(paths)
  if(paths.length===1){
    rejected.push({path:paths[0],diagnostics:r.errors})
    console.log('[中文TSX需补充依赖]',JSON.stringify(rejected.at(-1)))
    return
  }
  const half=Math.floor(paths.length/2)
  tryGroup(paths.slice(0,half))
  tryGroup(paths.slice(half))
}
tryGroup(candidates)
if(!check().ok)throw Error('Final localized TSX set fails full compilation')
const out={candidates:candidates.length,accepted:accepted.length,rejected:rejected.length,
  acceptedPaths:accepted,rejectedDetails:rejected,checks:checks.length,
  originalPreview:report.files.filter(x=>!x.ok)}
const output=resolve(root,'.rebuild/governance/localized-tsx-accepted.json')
mkdirSync(dirname(output),{recursive:true})
writeFileSync(output,JSON.stringify(out,null,2)+'\n')
console.log('[中文原始TSX验收]',JSON.stringify({
  candidates:out.candidates,accepted:out.accepted,rejected:out.rejected,
  notReady:out.originalPreview.length,compiles:out.checks
}))
if(!accepted.length)throw Error('No localized TSX candidates passed typechecking')
