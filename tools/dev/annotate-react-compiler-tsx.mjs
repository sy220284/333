#!/usr/bin/env node
import { loadAstParser } from './ast-parser.mjs'
/**
 * Restore erased TypeScript component signatures while preserving the current
 * compiled React JSX and all localized UI text. Only existing, local Props
 * declarations are eligible. A complete project typecheck validates each
 * accepted group before it can be committed.
 *
 * Preview: node tools/dev/annotate-react-compiler-tsx.mjs
 * Apply:   node tools/dev/annotate-react-compiler-tsx.mjs --apply
 */
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs'
import {resolve,dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
const ts = await loadAstParser()
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const apply=process.argv.includes('--apply')
const sourceFiles=[]
function walk(dir) {
  for(const item of readdirSync(resolve(root,dir),{withFileTypes:true})) {
    const child=join(dir,item.name).replaceAll('\\','/')
    if(item.isDirectory()){
      if(child.startsWith('src/skills/bundled')||child.startsWith('src/plugins/bundled'))continue
      walk(child)
    }else if(item.isFile()&&child.endsWith('.tsx'))sourceFiles.push(child)
  }
}
walk('src')
const records=[],skipped=[]
for(const path of sourceFiles.sort()){
  const content=readFileSync(resolve(root,path),'utf8')
  if(!content.includes('react/compiler-runtime'))continue
  const ast=ts.createSourceFile(path,content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  if(ast.parseDiagnostics.length){skipped.push({path,reason:'syntax-diagnostics'});continue}
  const names=new Set(ast.statements.filter(n=>ts.isTypeAliasDeclaration(n)||ts.isInterfaceDeclaration(n)).map(n=>n.name.text))
  const components=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&
    n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)&&
    n.name&&n.body&&!n.asteriskToken&&
    !n.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)&&
    n.parameters.length===1&&ts.isIdentifier(n.parameters[0].name)&&
    n.parameters[0].name.text==='t0'&&!n.parameters[0].type)
  if(!components.length)continue
  const additions=[]
  for(const fn of components){
    const name=fn.name.text
    const byName=[name+'Props',name+'Properties',name+'Options']
    const exact=byName.find(n=>names.has(n))
    const shared=names.has('Props')?'Props':undefined
    const allProps=[...names].filter(x=>x.endsWith('Props'))
    const props=exact??(shared&&components.length===1?shared:undefined)??(allProps.length===1&&components.length===1?allProps[0]:undefined)
    if(!props){skipped.push({path,fn:name,reason:'no-unambiguous-local-props'});continue}
    additions.push({index:fn.parameters[0].name.getEnd(),text:': '+props,kind:'parameter',name})
    if(!fn.type) {
      additions.push({index:fn.body.getStart(ast),text:": import('react').ReactNode ",kind:'return',name})
    }
  }
  if(!additions.length)continue
  let edited=content
  for(const add of [...additions].sort((a,b)=>b.index-a.index))
    edited=edited.slice(0,add.index)+add.text+edited.slice(add.index)
  const typed=ts.createSourceFile(path,edited,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  if(typed.parseDiagnostics.length){skipped.push({path,reason:'typed-output-parser-error'});continue}
  records.push({path,signatures:additions.length,functions:[...new Set(additions.map(x=>x.name))],edited,source:content})
}
const result={mode:apply?'apply':'preview',files:records.length,signatures:records.reduce((n,r)=>n+r.signatures,0),skipped,accepted:[],rejected:[],typechecks:0}
function check(){
  const r=spawnSync(process.execPath,['tools/dev/dev.mjs','typecheck:all'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024})
  result.typechecks++
  return {ok:r.status===0,errors:((r.stdout||'')+'\n'+(r.stderr||'')).split('\n').filter(s=>/error TS\d+/.test(s)).slice(0,10)}
}
if(apply){
  const baseline=check()
  if(!baseline.ok)throw new Error('The unmodified checkout fails typecheck: '+baseline.errors.join('\n'))
  function group(items){
    for(const r of items)writeFileSync(resolve(root,r.path),r.edited)
    const verdict=check()
    if(verdict.ok){
      result.accepted.push(...items.map(x=>({path:x.path,signatures:x.signatures,functions:x.functions})))
      console.log('[组件类型恢复成功]',JSON.stringify({files:items.length,accepted:result.accepted.length}))
      return
    }
    for(const r of items)writeFileSync(resolve(root,r.path),r.source)
    if(items.length===1){
      result.rejected.push({path:items[0].path,diagnostics:verdict.errors})
      return
    }
    const mid=Math.floor(items.length/2)
    group(items.slice(0,mid))
    group(items.slice(mid))
  }
  if(records.length)group(records)
  const final=check()
  if(!final.ok)throw new Error('Accepted TSX signatures failed final project typecheck: '+final.errors.join('\n'))
}
const out=resolve(root,'.rebuild/governance/react-compiler-tsx-types.json')
mkdirSync(dirname(out),{recursive:true})
writeFileSync(out,JSON.stringify({...result,
  acceptedSignatures:result.accepted.reduce((n,r)=>n+r.signatures,0),
  candidates:records.map(({path,signatures,functions})=>({path,signatures,functions}))
},null,2)+'\n')
console.log('[React编译产物类型恢复]',JSON.stringify({
  mode:result.mode,candidates:result.files,signatures:result.signatures,
  acceptedFiles:result.accepted.length,
  acceptedSignatures:result.accepted.reduce((n,r)=>n+r.signatures,0),
  rejected:result.rejected.length,skipped:skipped.length,typechecks:result.typechecks
}))
