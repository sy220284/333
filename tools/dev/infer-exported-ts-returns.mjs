#!/usr/bin/env node
/**
 * Restore safe, compiler-inferred return types of exported .ts functions.
 * TypeScript's actual checker supplies the type; unknown, any, inaccessible
 * imports, and oversized anonymous structures are deliberately excluded.
 * Only type syntax is inserted, never runtime expressions.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,dirname,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'
const require=createRequire(import.meta.url)
const ts=require('typescript')
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const apply=process.argv.includes('--apply')
const configPath=resolve(root,'.rebuild/tsconfig.dev.json')
const config=ts.readConfigFile(configPath,ts.sys.readFile)
if(config.error)throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'))
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,dirname(configPath))
if(parsed.errors.length)throw new Error(parsed.errors.map(x=>ts.flattenDiagnosticMessageText(x.messageText,'\n')).join('\n'))
const program=ts.createProgram({rootNames:parsed.fileNames,options:parsed.options})
const checker=program.getTypeChecker()
const candidates=[],skipped=[]
for(const file of program.getSourceFiles()){
  const path=relative(root,file.fileName).replaceAll('\\','/')
  if(!path.startsWith('src/')&&!path.startsWith('native/'))continue
  if(!path.endsWith('.ts')||path.endsWith('.d.ts'))continue
  if(path.startsWith('src/skills/bundled/')||path.startsWith('src/plugins/bundled/'))continue
  const text=file.getFullText()
  const adds=[]
  for(const item of file.statements){
    if(!ts.isFunctionDeclaration(item)||!item.name||!item.body||item.type)continue
    if(!item.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue
    const sig=checker.getSignatureFromDeclaration(item)
    if(!sig)continue
    const inferred=checker.getReturnTypeOfSignature(sig)
    const name=item.name.text
    const rendered=checker.typeToString(inferred,item,
      ts.TypeFormatFlags.NoTruncation|ts.TypeFormatFlags.UseFullyQualifiedType)
    const isUnknown=!!(inferred.flags&(ts.TypeFlags.Any|ts.TypeFlags.Unknown))
    const unsafe=isUnknown||rendered.length>160||
      /\b(?:any|unknown)\b|import\(|<anonymous>|__type|typeof import/.test(rendered)||
      !/^[\w\d<>, .\[\]|?:'"/-]+$/.test(rendered)
    if(unsafe){skipped.push({path,name,inferred:rendered.slice(0,180),reason:'not-a-safe-accessible-type'});continue}
    adds.push({index:item.body.getStart(file),text:': '+rendered+' ',name,returnType:rendered})
  }
  if(!adds.length)continue
  let updated=text
  for(const addition of [...adds].sort((a,b)=>b.index-a.index))
    updated=updated.slice(0,addition.index)+addition.text+updated.slice(addition.index)
  const parsedUpdate=ts.createSourceFile(path,updated,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
  if(parsedUpdate.parseDiagnostics.length){
    skipped.push({path,reason:'generated-code-does-not-parse'})
    continue
  }
  candidates.push({path,source:text,updated,additions:adds.map(({name,returnType})=>({name,returnType}))})
}
const result={mode:apply?'apply':'preview',
  files:candidates.length,signatures:candidates.reduce((n,x)=>n+x.additions.length,0),
  skipped,accepted:[],rejected:[],typechecks:0}
const typecheck=()=>{
  result.typechecks++
  const r=spawnSync(process.execPath,['tools/dev/dev.mjs','typecheck:all'],{
    cwd:root,encoding:'utf8',maxBuffer:32*1024*1024
  })
  return {ok:r.status===0,diagnostics:((r.stdout||'')+'\n'+(r.stderr||''))
    .split('\n').filter(x=>/error TS\d+/.test(x)).slice(0,8)}
}
if(apply){
  const initial=typecheck()
  if(!initial.ok)throw new Error('Base checkout fails typecheck: '+initial.diagnostics.join('\n'))
  const patch=items=>items.forEach(x=>writeFileSync(resolve(root,x.path),x.updated))
  const rollback=items=>items.forEach(x=>writeFileSync(resolve(root,x.path),x.source))
  function group(items){
    patch(items)
    const state=typecheck()
    if(state.ok){
      result.accepted.push(...items.map(x=>({path:x.path,additions:x.additions})))
      console.log('[真实推断返回类型成功]',JSON.stringify({files:items.length,total:result.accepted.length}))
      return
    }
    rollback(items)
    if(items.length===1){
      result.rejected.push({path:items[0].path,diagnostics:state.diagnostics})
      return
    }
    const mid=Math.floor(items.length/2)
    group(items.slice(0,mid))
    group(items.slice(mid))
  }
  if(candidates.length)group(candidates)
  if(!typecheck().ok)throw new Error('Final TypeScript return migration failed compilation')
}
const reportPath=resolve(root,'.rebuild/governance/inferred-ts-return-types.json')
mkdirSync(dirname(reportPath),{recursive:true})
writeFileSync(reportPath,JSON.stringify({
  ...result,
  candidates:candidates.map(({path,additions})=>({path,additions})),
  acceptedSignatures:result.accepted.reduce((n,x)=>n+x.additions.length,0)
},null,2)+'\n')
console.log('[源码推断签名检查]',JSON.stringify({mode:result.mode,candidates:result.files,
  signatures:result.signatures,accepted:result.accepted.length,
  acceptedSignatures:result.accepted.reduce((n,x)=>n+x.additions.length,0),
  rejected:result.rejected.length,typechecks:result.typechecks}))
