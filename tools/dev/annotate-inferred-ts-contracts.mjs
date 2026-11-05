#!/usr/bin/env node
/**
 * Derive explicit exported TypeScript signatures from the real project
 * typechecker. Only types proven by existing type inference are eligible.
 * No any/unknown placeholders, suppressions, or altered implementation.
 *
 * --apply writes safely inferred signatures.
 * --limit=40 limits the number of files in one CI-reviewed batch.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const ts=require('typescript')
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const apply=process.argv.includes('--apply')
const limitFlag=process.argv.find(x=>x.startsWith('--limit='))
const maxFiles=limitFlag?Number(limitFlag.slice(8)):Infinity
if(!(maxFiles===Infinity||(Number.isInteger(maxFiles)&&maxFiles>0)))throw Error('Invalid file limit')
const configPath=resolve(root,'.rebuild/tsconfig.dev.json')
if(!existsSync(configPath))throw Error('Run node tools/dev/dev.mjs typecheck:all first to create project config')
const config=ts.readConfigFile(configPath,ts.sys.readFile)
if(config.error)throw Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'))
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,dirname(configPath),{},configPath)
if(parsed.errors.length)throw Error(parsed.errors.map(x=>ts.flattenDiagnosticMessageText(x.messageText,'\n')).join('\n'))
const program=ts.createProgram(parsed.fileNames,parsed.options)
const checker=program.getTypeChecker()
const isExported=node=>node.modifiers?.some(x=>x.kind===ts.SyntaxKind.ExportKeyword)
const symbolOf=node=>{
  if(!node)return null
  let symbol=checker.getSymbolAtLocation(node)
  if(symbol&&(symbol.flags&ts.SymbolFlags.Alias))symbol=checker.getAliasedSymbol(symbol)
  return symbol||null
}
const callSites=new Map()
for(const file of program.getSourceFiles()){
  if(file.isDeclarationFile)continue
  const name=file.fileName.replaceAll('\\','/')
  if(!name.startsWith(root+'/src/')&&!name.startsWith(root+'/native/'))continue
  function visit(node){
    if(ts.isCallExpression(node)){
      const expression=ts.isPropertyAccessExpression(node.expression)?
        node.expression.name:node.expression
      const symbol=symbolOf(expression)
      if(symbol){
        const group=callSites.get(symbol)||[]
        group.push(node)
        callSites.set(symbol,group)
      }
    }
    ts.forEachChild(node,visit)
  }
  visit(file)
}
const valid=(string,type)=>{
  if(!string||string.length>155||/[\n\r]/.test(string))return false
  if(/\b(?:any|unknown|never)\b/.test(string))return false
  if(/\b(?:import|typeof|__type|unique symbol)\b/.test(string))return false
  if(/[{}]/.test(string))return false
  if(!/^[A-Za-z_$][\w.$<>,|&\[\] ()'":?-]*$/.test(string))return false
  if((type.flags & (ts.TypeFlags.Any|ts.TypeFlags.Unknown))!==0)return false
  return true
}
const shown=(type,node)=>{
  const rendered=checker.typeToString(type,node,ts.TypeFormatFlags.NoTruncation|ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope)
  return valid(rendered,type)?rendered:null
}
const all=[],unresolved=[]
for(const source of program.getSourceFiles()){
  const absolute=source.fileName.replaceAll('\\','/')
  const relative=absolute.startsWith(root+'/')?absolute.slice(root.length+1):null
  if(!relative||!(/^(src|native)\//.test(relative))||
     /\/(?:skills|plugins)\/bundled\//.test(relative)||!relative.match(/\.tsx?$/)||
     relative.endsWith('.d.ts'))continue
  const code=readFileSync(resolve(root,relative),'utf8')
  if(code.includes('react/compiler-runtime'))continue
  const insertions=[]
  const signatures=[]
  function annotate(node,name,ownerSymbol){
    for(let index=0;index<(node.parameters?.length??0);index++){
      const param=node.parameters[index]
      if(param.type)continue
      const type=checker.getWidenedType(checker.getTypeAtLocation(param))
      let rendered=shown(type,param)
      // A direct call is evidence of an argument type. Infer only when every
      // known call site supplies a concrete, printable type and all callers
      // agree; never replace arbitrary API boundaries with any or unknown.
      if(!rendered&&ownerSymbol){
        const calls=callSites.get(ownerSymbol)||[]
        if(calls.length){
          const observed=calls.map(call=>call.arguments[index]).filter(Boolean)
          if(observed.length===calls.length){
            const actual=observed.map(arg=>{
              const argType=checker.getWidenedType(checker.getTypeAtLocation(arg))
              return shown(argType,param)
            })
            if(actual.every(Boolean)){
              const unique=[...new Set(actual)]
              if(unique.length===1)rendered=unique[0]
              else if(unique.length<=3&&unique.every(t=>['string','number','boolean','undefined','null'].includes(t)))
                rendered=unique.join(' | ')
            }
          }
        }
      }
      if(!rendered||!ts.isIdentifier(param.name)||param.dotDotDotToken){
        unresolved.push({path:relative,function:name,kind:'parameter',at:source.getLineAndCharacterOfPosition(param.getStart()).line+1})
        continue
      }
      const target=param.questionToken?param.questionToken.getEnd():param.name.getEnd()
      insertions.push({at:target,text:': '+rendered,kind:'parameter',name})
      signatures.push({kind:'parameter',name,type:rendered})
    }
    if(node.type)return
    const signature=checker.getSignatureFromDeclaration(node)
    if(!signature){unresolved.push({path:relative,function:name,kind:'return',reason:'no signature'});return}
    const resultType=checker.getReturnTypeOfSignature(signature)
    const rendered=shown(resultType,node)
    if(!rendered){unresolved.push({path:relative,function:name,kind:'return',reason:'unsafe inferred type'});return}
    const head=code.slice(node.getStart(source),node.body?.getStart(source)??node.getEnd())
    let at
    if(ts.isArrowFunction(node)){
      const arrow=head.lastIndexOf('=>')
      if(arrow<0)return
      at=node.getStart(source)+arrow
    }else{
      const close=head.lastIndexOf(')')
      if(close<0)return
      at=node.getStart(source)+close+1
    }
    insertions.push({at,text:': '+rendered+' ',kind:'return',name})
    signatures.push({kind:'return',name,type:rendered})
  }
  function visit(node){
    if(ts.isFunctionDeclaration(node)&&node.body&&isExported(node))
      annotate(node,node.name?.text??'<default>',symbolOf(node.name))
    if(ts.isVariableStatement(node)&&isExported(node))
      for(const dec of node.declarationList.declarations)
        if(!dec.type&&dec.initializer&&
          (ts.isArrowFunction(dec.initializer)||ts.isFunctionExpression(dec.initializer)))
          annotate(dec.initializer,dec.name.getText(source),symbolOf(dec.name))
    ts.forEachChild(node,visit)
  }
  visit(source)
  if(insertions.length)all.push({path:relative,source:code,insertions,signatures})
}
all.sort((a,b)=>b.insertions.length-a.insertions.length||a.path.localeCompare(b.path))
const chosen=all.slice(0,maxFiles)
const seen=[]
if(apply)for(const row of chosen){
  let modified=row.source
  for(const insertion of [...row.insertions].sort((a,b)=>b.at-a.at))
    modified=modified.slice(0,insertion.at)+insertion.text+modified.slice(insertion.at)
  const ast=ts.createSourceFile(row.path,modified,ts.ScriptTarget.Latest,true,
    row.path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
  if(ast.parseDiagnostics.length){
    unresolved.push({path:row.path,reason:'generated syntax invalid',
      detail:ast.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,'\n'))})
    continue
  }
  writeFileSync(resolve(root,row.path),modified)
  seen.push(row.path)
}
const report={mode:apply?'apply':'preview',candidates:all.length,
  possibleAnnotations:all.reduce((n,x)=>n+x.insertions.length,0),
  selectedFiles:chosen.length,selectedAnnotations:chosen.reduce((n,x)=>n+x.insertions.length,0),
  appliedFiles:seen,unresolvedCount:unresolved.length,
  unresolved:unresolved.slice(0,800),files:all.map(x=>({path:x.path,count:x.insertions.length,signatures:x.signatures}))}
const dest=resolve(root,'.rebuild/governance/inferred-ts-contracts.json')
mkdirSync(dirname(dest),{recursive:true})
writeFileSync(dest,JSON.stringify(report,null,2)+'\n')
console.log('[实际TS推断类型批次]',JSON.stringify({
  mode:report.mode,candidates:report.candidates,
  possibleAnnotations:report.possibleAnnotations,
  selectedFiles:report.selectedFiles,selectedAnnotations:report.selectedAnnotations,
  appliedFiles:report.appliedFiles.length,unresolved:report.unresolvedCount,
  top:all.slice(0,20).map(x=>({path:x.path,count:x.insertions.length}))
}))
