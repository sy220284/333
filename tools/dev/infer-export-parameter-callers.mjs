#!/usr/bin/env node
import { loadAstParser } from './ast-parser.mjs'
/**
 * Infer missing exported parameter types from actual TypeScript call sites.
 * Call signatures are resolved by the compiler; typed argument evidence is
 * collected across src/native and widened conservatively. No "any" injection.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const ts = await loadAstParser()
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const apply=process.argv.includes('--apply')
const configPath=resolve(root,'.rebuild/tsconfig.dev.json')
const cfg=ts.readConfigFile(configPath,ts.sys.readFile)
if(cfg.error)throw Error('Invalid compiler config')
const parsed=ts.parseJsonConfigFileContent(cfg.config,ts.sys,dirname(configPath))
if(parsed.errors.length)throw Error('Invalid resolved TS options')
const program=ts.createProgram(parsed.fileNames,parsed.options)
const checker=program.getTypeChecker()
const typeFlags=ts.TypeFormatFlags.NoTruncation|ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
const bySignature=new Map(),byFile=new Map(),missing=[]
function sourcePath(sf){
  const x=sf.fileName.replaceAll('\\','/')
  const prefix=root.replaceAll('\\','/')+'/'
  if(!x.startsWith(prefix))return null
  const path=x.slice(prefix.length)
  return /^(?:src|native)\//.test(path)&&/\.tsx?$/.test(path)&&
    !/\.d\.ts$/.test(path)&&!path.startsWith('src/skills/bundled/')&&
    !path.startsWith('src/plugins/bundled/')?path:null
}
const files=program.getSourceFiles().filter(sf=>sourcePath(sf)!==null)
const exportFlag=node=>node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)
for(const sf of files){
  for(const statement of sf.statements){
    let fn=null,name=''
    if(ts.isFunctionDeclaration(statement)&&statement.body&&exportFlag(statement)){
      fn=statement;name=statement.name?.text??'default'
    }
    if(ts.isVariableStatement(statement)&&exportFlag(statement)){
      for(const dec of statement.declarationList.declarations){
        const val=dec.initializer
        if(!dec.type&&val&&(ts.isArrowFunction(val)||ts.isFunctionExpression(val))){
          const key=val
          if(val.parameters.some(p=>!p.type)){
            bySignature.set(key,{sf,path:sourcePath(sf),name:dec.name.getText(sf),fn:val,
              evidence:new Map()})
          }
        }
      }
    }
    if(fn&&fn.parameters.some(p=>!p.type)){
      bySignature.set(fn,{sf,path:sourcePath(sf),name,fn,evidence:new Map()})
    }
  }
}
function typed(type,location){
  if(!type||type.flags&(ts.TypeFlags.Any|ts.TypeFlags.Unknown|ts.TypeFlags.Never))return null
  if(type.flags&ts.TypeFlags.StringLike)return 'string'
  if(type.flags&ts.TypeFlags.NumberLike)return 'number'
  if(type.flags&ts.TypeFlags.BooleanLike)return 'boolean'
  if(type.flags&ts.TypeFlags.Null)return 'null'
  if(type.flags&ts.TypeFlags.Undefined)return 'undefined'
  const value=checker.typeToString(type,location,typeFlags)
  if(!value||value.length>180||/\bany\b|\b__type\b/.test(value)||
    /[\r\n]/.test(value)||value.startsWith('import('))return null
  return value
}
for(const sf of files){
  function visit(node){
    if(ts.isCallExpression(node)||ts.isNewExpression(node)){
      const sig=checker.getResolvedSignature(node)
      const target=sig?.declaration
      const entry=bySignature.get(target)
      if(entry){
        const args=node.arguments??[]
        for(let i=0;i<entry.fn.parameters.length;i++){
          const param=entry.fn.parameters[i]
          if(param.type)continue
          const arg=args[i]
          if(!arg)continue
          const str=typed(checker.getTypeAtLocation(arg),arg)
          if(!str)continue
          const list=entry.evidence.get(i)??[]
          list.push({type:str,path:sourcePath(sf),line:sf.getLineAndCharacterOfPosition(arg.getStart(sf)).line+1})
          entry.evidence.set(i,list)
        }
      }
    }
    ts.forEachChild(node,visit)
  }
  ts.forEachChild(sf,visit)
}
const reportEntries=[]
for(const entry of bySignature.values()){
  const updates=[]
  for(let i=0;i<entry.fn.parameters.length;i++){
    const p=entry.fn.parameters[i]
    if(p.type)continue
    const evidence=entry.evidence.get(i)??[]
    const kinds=[...new Set(evidence.map(v=>v.type))]
    if(kinds.length<1||kinds.length>4){
      missing.push({path:entry.path,name:entry.name,param:p.name.getText(entry.sf),
        reason:kinds.length?'ambiguous-callsite-types':'no-statically-typed-callsite',
        candidates:kinds,callSites:evidence.length})
      continue
    }
    const annotation=kinds.length===1?kinds[0]:kinds.join(' | ')
    if(annotation==='null'||annotation==='undefined'||annotation.includes('=>')){
      missing.push({path:entry.path,name:entry.name,param:p.name.getText(entry.sf),
        reason:'insufficient-argument-evidence',candidates:kinds,callSites:evidence.length})
      continue
    }
    updates.push({position:p.questionToken?.end??p.name.end,annotation,
      param:p.name.getText(entry.sf),evidence:evidence.slice(0,15)})
  }
  if(!updates.length)continue
  const path=entry.path
  const list=byFile.get(path)??[]
  list.push(...updates)
  byFile.set(path,list)
}
const changes=[],rejected=[]
for(const [path,items] of byFile){
  const sf=files.find(v=>sourcePath(v)===path)
  let text=sf.text
  for(const v of [...items].sort((a,b)=>b.position-a.position)){
    text=text.slice(0,v.position)+': '+v.annotation+text.slice(v.position)
  }
  const after=ts.createSourceFile(sf.fileName,text,ts.ScriptTarget.Latest,true,
    path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
  if(after.parseDiagnostics.length){
    rejected.push({path,reason:'generated-parse-error',items})
    continue
  }
  changes.push({path,annotations:items.length,details:items.map(({position,...rest})=>rest),content:text})
}
const report={mode:apply?'apply':'preview',
  candidates:changes.length,
  inferredParameters:changes.reduce((n,x)=>n+x.annotations,0),
  needSourceDefinition:missing,parseRejected:rejected,
  files:changes.map(({content,...rest})=>rest)}
const out=resolve(root,'.rebuild/governance/type-parameter-callsite-evidence.json')
mkdirSync(dirname(out),{recursive:true})
writeFileSync(out,JSON.stringify(report,null,2)+'\n')
if(apply)for(const entry of changes)writeFileSync(resolve(root,entry.path),entry.content)
console.log('[调用链参数类型推断]',JSON.stringify({
  mode:report.mode,files:report.candidates,parameters:report.inferredParameters,
  manual:missing.length,rejected:rejected.length,
  top:changes.sort((a,b)=>b.annotations-a.annotations).slice(0,15).map(x=>({path:x.path,n:x.annotations}))
}))
