import {readFileSync,readdirSync,existsSync} from 'node:fs'
import {resolve,dirname,join,relative} from 'node:path'
import {fileURLToPath} from 'node:url'

/**
 * Official 317 private features are not shipped by this external build.
 * Audit each conditional require and reject any missing module reachable
 * under the actual Bun production feature list and USER_TYPE replacement.
 * This is a release contract, so enabling a private feature must first
 * bring in its complete implementation.
 */
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)))
const src=join(ROOT,'src')
const builder=readFileSync(join(ROOT,'build/rebuild.mjs'),'utf8')
const at=builder.indexOf('  features: [')
if(at<0)throw new Error('Missing Bun release feature configuration')
const end=builder.indexOf(']',at)
if(end<0)throw new Error('Malformed Bun release feature configuration')
const flags=new Set([...builder.slice(at,end).matchAll(/['"]([A-Z][A-Z0-9_]+)['"]/g)]
  .map(match=>match[1]))
const userType=builder.match(/'process\.env\.USER_TYPE':\s*'\"([^\"\n]+)\"'/)?.[1]
if(!userType)throw new Error('Production build USER_TYPE must be statically defined')

const sources=[]
function collect(dir){
  for(const entry of readdirSync(dir,{withFileTypes:true})){
    const path=join(dir,entry.name)
    if(entry.isDirectory())collect(path)
    else if(entry.isFile()&&/\.(ts|tsx|js|mjs)$/.test(entry.name))sources.push(path)
  }
}
collect(src)
const findings=[]
const missingPaths=new Set()
for(const path of sources){
  let source
  try{source=readFileSync(path,'utf8')}catch(error){
    if(error?.code==='ERR_INVALID_ARG_VALUE')continue
    throw error
  }
  for(const call of source.matchAll(/\brequire\(\s*(['"])(\.{1,2}\/[^'"]+)\1\s*\)/g)){
    let file=resolve(dirname(path),call[2])
    if(file.endsWith('.js'))file=file.slice(0,-3)
    if(['.ts','.tsx','.js','.mjs','.json','.txt',''].some(ext=>existsSync(file+ext)))continue
    const context=source.slice(Math.max(0,call.index-280),call.index)
    const featureNames=[...context.matchAll(/feature\(['"]([A-Z0-9_]+)['"]\)/g)]
      .map(x=>x[1])
    const antOnly=/process\.env\.USER_TYPE\s*===\s*['"]ant['"]/.test(context)
    const disabled=featureNames.filter(f=>!flags.has(f))
    const reachable=!((antOnly&&userType!=='ant')||disabled.length>0)
    const finding={path:relative(ROOT,path).replaceAll('\\','/'),
      line:source.slice(0,call.index).split('\n').length,
      module:call[2],disabledFeatures:disabled,
      userTypeRequired:antOnly?'ant':null,reachable}
    findings.push(finding)
    missingPaths.add(call[2])
  }
}
const unsafe=findings.filter(f=>f.reachable)
const report={
  target:'2.1.317',productionUserType:userType,
  productionFeatures:[...flags].sort(),sourceFiles:sources.length,
  missingOptionalReferences:findings.length,uniquePaths:missingPaths.size,
  releaseUnsafeCount:unsafe.length,
  ...(process.argv.includes('--details')?{findings}:{unsafe}),
}
console.log(JSON.stringify(report,null,2))
if(unsafe.length)process.exitCode=1
