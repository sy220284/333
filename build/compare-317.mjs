import assert from 'node:assert/strict'
import {readdirSync,readFileSync,statSync} from 'node:fs'
import {resolve,relative,join} from 'node:path'
import {fileURLToPath} from 'node:url'
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)))
const parse=path=>JSON.parse(readFileSync(resolve(ROOT,path),'utf8'))
const SOURCE_EXT=/\.(ts|tsx|js|mjs|cjs)$/
function files(dir,out=[]){
 for(const item of readdirSync(dir,{withFileTypes:true})){
  const full=join(dir,item.name)
  if(item.isDirectory())files(full,out)
  else if(item.isFile()&&SOURCE_EXT.test(item.name))out.push(full)
 }
 return out
}
export function commandNames(source){
 return [...new Set([...source.matchAll(/\.command\(\s*['"\x60]([a-z][a-z0-9-]*)/g)].map(x=>x[1]))]
}
export function compare317(){
 const baseline=parse('docs/upgrade/2.1.317-功能与场景源数据.json')
 const plan=parse('docs/upgrade/2.1.317-六层完整功能链路.json')
 const official=parse('tests/fixtures/claude-2.1.317-official-cli-help.json')
 assert.equal(official.version,'2.1.317')
 assert.equal(baseline.features.length,137)
 assert.equal(plan.layers.length,6)
 const paths=files(resolve(ROOT,'src'))
 const sources=paths.map(p=>({path:relative(ROOT,p).replaceAll('\\','/'),text:readFileSync(p,'utf8')}))
 const commands=commandNames(readFileSync(resolve(ROOT,'src/main.tsx'),'utf8'))
 const officialRoot=official.commands['--help'].commands
 const missingRoot=officialRoot.filter(c=>!commands.includes(c))
 const officialPlugins=official.commands['plugin --help'].commands.filter(c=>c!=='help')
 const missingPlugins=officialPlugins.filter(c=>!commands.includes(c))
 const chainMap=new Map(plan.routes.flatMap(r=>r.baseline_feature_ids.map(id=>[id,r])))
 const features=baseline.features.map(f=>{
  const owner=chainMap.get(f.id)
  assert.ok(owner,f.id+' no owner')
  if(!f.candidate_search_tokens?.length)return {id:f.id,chain:owner.id,owner:owner.layer,state:'EXISTING_CODE_RECHECK',source_files:owner.source_candidates}
  const found=sources.filter(s=>f.candidate_search_tokens.some(token=>s.text.includes(token)))
  return {id:f.id,chain:owner.id,owner:owner.layer,state:found.length?'CANDIDATE_TOKEN_PRESENT':'TARGET_FUNCTION_NOT_FOUND',source_files:found.slice(0,8).map(x=>x.path)}
 })
 return {target:'2.1.317',implementation_status:'IN_PROGRESS',counts:{source_files_scanned:paths.length,features:features.length,scenarios:baseline.scenarios.length,chains:plan.routes.length,layers:plan.layers.length,source_tokens_present:features.filter(x=>x.state==='CANDIDATE_TOKEN_PRESENT').length,source_tokens_absent:features.filter(x=>x.state==='TARGET_FUNCTION_NOT_FOUND').length},cli:{official_root_commands:officialRoot.length,registered_root_commands:commands,missing_root_commands:missingRoot,missing_plugin_commands:missingPlugins},features,layer_status:plan.layers.map(l=>({id:l.id,name:l.title,chain_count:l.chain_ids.length,state:'IMPLEMENTATION_IN_PROGRESS'})),note:'命中源码仅说明存在相关代码；没有命中只表示本次扫描未找到，最终以新版函数语义及实际运行对齐为准。无额外证据或人工签收流程。'}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=compare317()
 if(process.argv.includes('--json'))console.log(JSON.stringify(result,null,2))
 else console.log(JSON.stringify({target:result.target,counts:result.counts,cli:result.cli,missing_new_features:result.features.filter(x=>x.state==='TARGET_FUNCTION_NOT_FOUND').map(x=>x.id)},null,2))
}
