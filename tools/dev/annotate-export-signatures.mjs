#!/usr/bin/env node
import { loadAstParser } from './ast-parser.mjs'
/**
 * TypeScript semantic export-signature reconstruction.
 * Uses the TS checker to infer exact return/parameter types from implementation,
 * never annotates with "any", and preserves the current source text byte-for-byte
 * except the inferred type annotations. Uninferrable signatures are reported.
 *
 * Requires .rebuild/tsconfig.dev.json produced by dev.mjs typecheck:all.
 */
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const ts = await loadAstParser()
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const apply=process.argv.includes('--apply')
const configPath=resolve(root,'.rebuild/tsconfig.dev.json')
if(!existsSync(configPath))throw new Error('First run: node tools/dev/dev.mjs typecheck:all')
const configData=ts.readConfigFile(configPath,ts.sys.readFile)
if(configData.error)throw new Error(ts.flattenDiagnosticMessageText(configData.error.messageText,'\n'))
const parsed=ts.parseJsonConfigFileContent(configData.config,ts.sys,dirname(configPath))
if(parsed.errors.length)throw new Error('Invalid TS config: '+parsed.errors.map(e=>e.code).join(','))
const program=ts.createProgram(parsed.fileNames,parsed.options)
const checker=program.getTypeChecker()
const format=ts.TypeFormatFlags.NoTruncation|ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
const files=[],skipped=[]
const runType=(type,node)=>{
  if(!type)return null
  if(type.flags & ts.TypeFlags.Any)return null
  const rendered=checker.typeToString(type,node,format)
  if(!rendered||rendered.length>320||/\bany\b/.test(rendered)||
     /\b__type\b/.test(rendered)||/\n/.test(rendered)||/\r/.test(rendered))return null
  return rendered
}
const isExport=node=>node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)
function analyse(sf){
  let original=sf.text,insertions=[],declined=[]
  function append(position,text,reason){
    insertions.push({position,text,reason})
  }
  function signature(fn,nodeName){
    const sig=checker.getSignatureFromDeclaration(fn)
    if(!sig){declined.push({name:nodeName,reason:'no-signature'});return}
    const ret=fn.type
    if(!ret){
      let end=fn.parameters.end
      let tail=original.slice(end,fn.body?.getStart(sf)??Math.min(end+500,original.length))
      let close=tail.indexOf(')')
      if(close<0 || close>300){
        declined.push({name:nodeName,reason:'no-parameter-close'});return
      }
      const pos=end+close+1
      // Unparenthesized arrow parameters cannot carry an explicit return annotation.
      const prefix=original.slice(fn.getStart(sf),fn.parameters.pos)
      const arrow=ts.isArrowFunction(fn)
      if(!arrow||prefix.includes('(')){
        const inferred=runType(checker.getReturnTypeOfSignature(sig),fn)
        if(inferred)append(pos,': '+inferred,nodeName+':return')
        else declined.push({name:nodeName,reason:'return-inference-unsafe'})
      } else declined.push({name:nodeName,reason:'unparenthesized-arrow'})
    }
    for(const p of fn.parameters){
      if(p.type)continue
      const inferred=runType(checker.getTypeAtLocation(p),p)
      if(!inferred){declined.push({name:nodeName,reason:'parameter-uninferrable',param:p.name.getText(sf)});continue}
      if(p.dotDotDotToken&&p.name.getText(sf)==='arguments')continue
      const position=p.questionToken?.end ?? p.name.end
      append(position,': '+inferred,nodeName+':param:'+p.name.getText(sf))
    }
  }
  for(const node of sf.statements){
    if(ts.isFunctionDeclaration(node) && node.body && isExport(node))signature(node,node.name?.text??'<default>')
    if(ts.isVariableStatement(node)&&isExport(node)){
      for(const declaration of node.declarationList.declarations){
        const fn=declaration.initializer
        if(!fn||!(ts.isArrowFunction(fn)||ts.isFunctionExpression(fn))||declaration.type)continue
        signature(fn,declaration.name.getText(sf))
      }
    }
  }
  const seen=new Map()
  for(const insertion of insertions){
    if(seen.has(insertion.position))throw Error('Duplicate type insertion in '+sf.fileName)
    seen.set(insertion.position,insertion)
  }
  for(const insertion of [...insertions].sort((a,b)=>b.position-a.position)){
    original=original.slice(0,insertion.position)+insertion.text+original.slice(insertion.position)
  }
  const checked=ts.createSourceFile(sf.fileName,original,ts.ScriptTarget.Latest,true,
    sf.fileName.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
  if(checked.parseDiagnostics.length){
    return {code:sf.text,insertions:[],declined:[...declined,{reason:'post-transform-parser-error',
      message:ts.flattenDiagnosticMessageText(checked.parseDiagnostics[0].messageText,'\n')}]} 
  }
  return {code:original,insertions,declined}
}
for(const sf of program.getSourceFiles()){
  const path=sf.fileName.replaceAll('\\','/').replace(root.replaceAll('\\','/')+'/','')
  if(!/^(src|native)\//.test(path)||!/\.tsx?$/.test(path)||/\.d\.ts$/.test(path)||
    path.startsWith('src/skills/bundled/')||path.startsWith('src/plugins/bundled/'))continue
  const output=analyse(sf)
  if(output.insertions.length){
    files.push({path,insertions:output.insertions.map(({reason,text})=>({reason,type:text.slice(2)})),
      count:output.insertions.length,source:output.code})
  }
  if(output.declined.length)skipped.push({path,items:output.declined})
}
const report={revision:process.env.GITHUB_SHA||null,mode:apply?'apply':'preview',
  files:files.length,annotations:files.reduce((n,f)=>n+f.count,0),
  skipped:skipped.reduce((n,p)=>n+p.items.length,0),
  declined:skipped,changes:files.map(({path,count,insertions})=>({path,count,insertions}))}
const out=resolve(root,'.rebuild/governance/export-types-inference.json')
mkdirSync(dirname(out),{recursive:true})
writeFileSync(out,JSON.stringify(report,null,2)+'\n')
if(apply)for(const f of files)writeFileSync(resolve(root,f.path),f.source)
console.log('[导出签名真实类型推断]',JSON.stringify({
  mode:report.mode,files:report.files,annotations:report.annotations,
  remainingUninferrable:report.skipped,
  top:report.changes.sort((a,b)=>b.count-a.count).slice(0,20).map(x=>({path:x.path,count:x.count}))
}))
