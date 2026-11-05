#!/usr/bin/env node
/** Derive exported argument types from checked, concrete TypeScript call sites. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require=createRequire(import.meta.url),ts=require('typescript')
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const report=JSON.parse(readFileSync(resolve(root,'.rebuild/governance/type-migration-report.json'),'utf8'))
const cfg=resolve(root,'.rebuild/tsconfig.dev.json'),file=ts.sys.fileExists(cfg)?cfg:resolve(root,'tsconfig.json')
const raw=ts.readConfigFile(file,ts.sys.readFile)
if(raw.error)throw Error(ts.flattenDiagnosticMessageText(raw.error.messageText,'\n'))
const parsed=ts.parseJsonConfigFileContent(raw.config,ts.sys,dirname(file))
const program=ts.createProgram(parsed.fileNames,{...parsed.options,noEmit:true})
const checker=program.getTypeChecker(),out=resolve(root,'.rebuild/call-proposals')
const candidates=new Map(),sensors=new Map(),stats={callSites:0,targets:0,files:0,changed:0,addedParameters:0,skipped:0,syntaxFailures:0}
const only=node=>node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)
for(const item of report.ranked){
  const sf=program.getSourceFile(resolve(root,item.path))
  if(!sf)continue
  const targets=new Map()
  function visit(node){
    if(ts.isFunctionDeclaration(node)&&node.body&&only(node))
      for(const p of node.parameters)if(!p.type&&ts.isIdentifier(p.name))targets.set(p.pos,p)
    if(ts.isVariableStatement(node)&&only(node))for(const d of node.declarationList.declarations){
      const v=d.initializer
      if(v&&!d.type&&(ts.isArrowFunction(v)||ts.isFunctionExpression(v)))
        for(const p of v.parameters)if(!p.type&&ts.isIdentifier(p.name))targets.set(p.pos,p)
    }
    ts.forEachChild(node,visit)
  }
  visit(sf)
  if(targets.size)candidates.set(sf.fileName,targets)
  stats.targets+=targets.size
}
function stable(type,node){
  const flags=type.flags
  if(flags&(ts.TypeFlags.Any|ts.TypeFlags.Unknown|ts.TypeFlags.Never))return null
  if(flags&ts.TypeFlags.StringLiteral)return 'string'
  if(flags&ts.TypeFlags.NumberLiteral)return 'number'
  if(flags&ts.TypeFlags.BooleanLiteral)return 'boolean'
  if(flags&ts.TypeFlags.Null)return 'null'
  const code=checker.typeToString(type,node,ts.TypeFormatFlags.NoTruncation|
    ts.TypeFormatFlags.UseFullyQualifiedType|ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope)
  if(!code||code.length>420||/\b(?:any|unknown|never)\b/.test(code)||/[\r\n]/.test(code))return null
  return code
}
for(const sf of program.getSourceFiles()){
  if(sf.isDeclarationFile||!sf.fileName.startsWith(root+'/src/'))continue
  function walk(node){
    if(ts.isCallExpression(node)||ts.isNewExpression(node)){
      let signature
      try{signature=checker.getResolvedSignature(node)}catch{}
      const decl=signature?.getDeclaration()
      const targets=decl&&candidates.get(decl.getSourceFile().fileName)
      if(targets&&decl.parameters){
        const params=decl.parameters,args=node.arguments??[]
        for(let i=0;i<Math.min(params.length,args.length);i++){
          const param=params[i]
          if(!targets.has(param.pos)||param.dotDotDotToken)continue
          let type
          try{type=checker.getTypeAtLocation(args[i])}catch{continue}
          const value=stable(type,param)
          if(!value)continue
          const id=decl.getSourceFile().fileName+'#'+param.pos
          if(!sensors.has(id))sensors.set(id,new Map())
          const gathered=sensors.get(id)
          gathered.set(value,(gathered.get(value)??0)+1)
          stats.callSites++
        }
      }
    }
    ts.forEachChild(node,walk)
  }
  walk(sf)
}
for(const [full,targets] of candidates){
  const sf=program.getSourceFile(full),path=full.slice(root.length+1)
  stats.files++
  const source=readFileSync(full,'utf8'),edits=[]
  for(const [pos,param] of targets){
    const seen=sensors.get(full+'#'+pos)
    if(!seen||seen.size>4||[...seen.keys()].includes('null')){stats.skipped++;continue}
    const list=[...seen.keys()].sort()
    const type=list.length===1?list[0]:list.join(' | ')
    if(type.length>420){stats.skipped++;continue}
    edits.push({pos:param.name.getEnd(),text:': '+type})
  }
  if(!edits.length)continue
  let code=source
  for(const edit of edits.sort((a,b)=>b.pos-a.pos))code=code.slice(0,edit.pos)+edit.text+code.slice(edit.pos)
  const ast=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
  if(ast.parseDiagnostics.length){stats.syntaxFailures++;continue}
  const outFile=join(out,path)
  mkdirSync(dirname(outFile),{recursive:true});writeFileSync(outFile,code)
  stats.changed++;stats.addedParameters+=edits.length
}
mkdirSync(out,{recursive:true})
writeFileSync(join(out,'proposal-report.json'),JSON.stringify({stats},null,2))
console.log('[TypeScript callsite-derived parameters]',JSON.stringify(stats))
if(stats.syntaxFailures)console.error('Rejected '+stats.syntaxFailures+' syntactically invalid proposals')
