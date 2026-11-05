#!/usr/bin/env node
/**
 * Reuse previously verified TSX originals without repeating hundreds of full
 * project compilations. Files changed since the verification SHA are skipped
 * to protect subsequent work in the active PR branch.
 *
 * Inputs:
 * .rebuild/verified/inline-ts-compatible-report.json
 * .rebuild/verified/inline-ts-source-recovery.json
 * .rebuild/governance/inline-ts-source-recovery.json (current preview)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = name => JSON.parse(readFileSync(resolve(root, name), 'utf8'))
const prior = read('.rebuild/verified/inline-ts-compatible-report.json')
const baseline = read('.rebuild/verified/inline-ts-source-recovery.json')
const current = read('.rebuild/governance/inline-ts-source-recovery.json')
const oldSha = baseline.revision
if (typeof oldSha !== 'string' || !/^[0-9a-f]{40}$/.test(oldSha)) {
  throw new Error('Prior audited baseline commit SHA is missing')
}
execFileSync('git', ['merge-base', '--is-ancestor', oldSha, 'HEAD'], {cwd:root})
const changed = new Set(execFileSync('git', ['diff','--name-only',oldSha,'HEAD','--','src','native'], {
  cwd:root,encoding:'utf8',
}).split(/\r?\n/).filter(Boolean))
const acceptedSet = new Set(prior.acceptedPaths)
const currentSet = new Set(current.files.map(x=>x.path))
const protectedPaths = prior.acceptedPaths.filter(path=>changed.has(path))
const alreadyRestoredPaths = prior.acceptedPaths.filter(path=>!currentSet.has(path))
const selected = current.files.map(x=>x.path).filter(path=>acceptedSet.has(path) && !changed.has(path))
const snapshots = new Map(selected.map(path=>[path,readFileSync(resolve(root,path),'utf8')]))
function original(path) {
  const source = snapshots.get(path)
  const match = source.match(/\/\/[#@]\s*sourceMappingURL=data:application\/json(?:;charset=utf-8)?;base64,([A-Za-z0-9+/=]+)\s*$/)
  if (!match) throw new Error('Inline source map no longer exists: '+path)
  const map = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'))
  if (map.sources?.length!==1 || map.sourcesContent?.length!==1 ||
      basename(map.sources[0])!==basename(path) ||
      typeof map.sourcesContent[0]!=='string') {
    throw new Error('Invalid original TSX source map: '+path)
  }
  const output = map.sourcesContent[0]
  return output.endsWith('\n') ? output : output+'\n'
}
const decoded=new Map(selected.map(path=>[path,original(path)]))
function apply(paths) {
  for(const path of paths)writeFileSync(resolve(root,path),decoded.get(path))
}
function revert(paths) {
  for(const path of paths)writeFileSync(resolve(root,path),snapshots.get(path))
}
function typecheck() {
  const call=spawnSync(process.execPath,['tools/dev/dev.mjs','typecheck:all'],{
    cwd:root,encoding:'utf8',maxBuffer:32*1024*1024
  })
  const output=(call.stdout??'')+'\n'+(call.stderr??'')
  return {ok:call.status===0,errors:output.split('\n').filter(l=>/error TS\d+/.test(l)).slice(0,20),
    exit:call.status,signal:call.signal}
}
const initial=typecheck()
if(!initial.ok)throw new Error('Current checkout already fails TypeScript checks:\n'+initial.errors.join('\n'))
let calls=1
const verified=[],rejected=[]
function checkBatch(paths){
  apply(paths)
  const result=typecheck()
  calls++
  if(result.ok){
    verified.push(...paths)
    console.log('[已验证恢复]',JSON.stringify({batch:paths.length,total:verified.length}))
    return
  }
  revert(paths)
  if(paths.length===1){
    rejected.push({path:paths[0],diagnostics:result.errors})
    return
  }
  const half=Math.floor(paths.length/2)
  checkBatch(paths.slice(0,half))
  checkBatch(paths.slice(half))
}
if(selected.length)checkBatch(selected)
if(!typecheck().ok)throw new Error('Restored files failed final repository typecheck')
calls++
const report={
  source:'GitHub Actions verified TSX originals',priorSha:oldSha,
  priorAccepted:acceptedSet.size,currentCandidates:current.files.length,
  currentSelected:selected.length,restored:verified.length,
  changedSincePrior:protectedPaths,alreadyRestored:alreadyRestoredPaths,
  additionalFailures:rejected,originallyRejected:prior.rejectedDetails,
  typecheckInvocations:calls,acceptedPaths:verified
}
const out=resolve(root,'.rebuild/governance/inline-ts-current-batch.json')
mkdirSync(dirname(out),{recursive:true})
writeFileSync(out,JSON.stringify(report,null,2)+'\n')
console.log('[新版PR7源码恢复]',JSON.stringify({
  restored:verified.length,protected:protectedPaths.length,
  notCandidates:alreadyRestoredPaths.length,additionalFailures:rejected.length,
  referenceRejected:prior.rejectedDetails.length,typechecks:calls
}))
