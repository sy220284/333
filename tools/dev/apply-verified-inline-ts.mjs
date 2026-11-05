#!/usr/bin/env node
/**
 * Replay only the 199 independently typechecked original TSX sources.
 * The acceptance manifest comes from the immutable GitHub Actions artifact.
 * Every source must still match its already-audited base revision. Files
 * modified after that revision are separately flagged for manual porting.
 */
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs'
import {resolve, dirname, basename} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const reportPath=process.argv[2]
if(!reportPath)throw new Error('Usage: node tools/dev/apply-verified-inline-ts.mjs <compatible-report.json>')
const previous=JSON.parse(readFileSync(resolve(root,reportPath),'utf8'))
if(previous.originalCandidates!==232 || previous.accepted!==199 ||
  previous.rejected!==33 || previous.acceptedPaths?.length!==199)
  throw new Error('The previously verified recovery manifest does not match 232/199/33')
const base='80a1268e73913b9ac834babc65a88b041f8d5df4'
const origin=spawnSync('git',['cat-file','-e',base+'^{commit}'],{cwd:root})
if(origin.status!==0)throw new Error('Missing verified baseline commit: '+base)
const applied=[], skipped=[], errors=[]
const sourcemap=/\/\/[#@]\s*sourceMappingURL=data:application\/json(?:;charset=utf-8)?;base64,([A-Za-z0-9+/=]+)\s*$/
for(const path of previous.acceptedPaths) {
  if(typeof path!=='string'||!/^src\/[a-zA-Z0-9_./-]+\.tsx?$/.test(path)||path.includes('..'))
    throw new Error('Unsafe recovery path: '+JSON.stringify(path))
  const dst=resolve(root,path)
  if(!existsSync(dst)){skipped.push({path,reason:'missing-current-file'});continue}
  const diff=spawnSync('git',['diff','--quiet',base,'HEAD','--',path],{cwd:root})
  if(diff.status===1){skipped.push({path,reason:'updated-since-verified-baseline'});continue}
  if(diff.status!==0)throw new Error('Git diff failed for '+path)
  const current=readFileSync(dst,'utf8')
  const m=current.match(sourcemap)
  if(!m){skipped.push({path,reason:'no-current-inline-source-map'});continue}
  let map
  try {map=JSON.parse(Buffer.from(m[1],'base64').toString('utf8'))}
  catch(e){errors.push({path,reason:'invalid-source-map: '+String(e)});continue}
  if(map.sources?.length!==1||map.sourcesContent?.length!==1||
    basename(map.sources[0])!==basename(path)||
    typeof map.sourcesContent[0]!=='string'||!map.sourcesContent[0].trim()||
    map.sourcesContent[0].includes('sourceMappingURL=data:')){
    errors.push({path,reason:'invalid-or-ambiguous-source-map'});continue
  }
  let original=map.sourcesContent[0]
  if(!original.endsWith('\n'))original+='\n'
  writeFileSync(dst,original)
  applied.push(path)
}
const dest=resolve(root,'.rebuild/governance/inline-ts-replay-report.json')
mkdirSync(dirname(dest),{recursive:true})
const result={
  sourceRun:41944872230,verifiedBaseline:base,acceptedInPriorRun:199,
  applied:applied.length,skipped:skipped.length,errors:errors.length,
  appliedPaths:applied,skippedDetails:skipped,invalid:errors,
  unresolvedFromEarlierRun:previous.rejectedDetails
}
writeFileSync(dest,JSON.stringify(result,null,2)+'\n')
console.log('[原始TSX批量复用]',JSON.stringify({
  acceptedPreviously:199,applied:applied.length,
  changedSinceBaseline:skipped.filter(x=>x.reason==='updated-since-verified-baseline').length,
  skipped:skipped.length,invalid:errors.length,
  report:'.rebuild/governance/inline-ts-replay-report.json'
}))
if(errors.length)throw new Error('Recovery verification errors: '+JSON.stringify(errors))
if(!applied.length)throw new Error('No verified TSX files could be replayed')
