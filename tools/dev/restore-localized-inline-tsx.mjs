#!/usr/bin/env node
import { loadAstParser } from './ast-parser.mjs'
/**
 * Recover pre-React-Compiler TSX and map each localized UI literal back to
 * its original TypeScript source location. Ambiguous mappings are rejected.
 * --apply writes only sources preserving every Chinese phrase and parsing.
 */
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs'
import {join,resolve,dirname,basename} from 'node:path'
import {fileURLToPath} from 'node:url'
const ts = await loadAstParser()
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const apply=process.argv.includes('--apply')
const inline=/\/\/[#@]\s*sourceMappingURL=data:application\/json(?:;charset=utf-8)?;base64,([A-Za-z0-9+/=]+)\s*$/
const chinese=/[\u3400-\u9fff]{2,}/g
const paths=[]
function walk(folder){
  for(const item of readdirSync(resolve(root,folder),{withFileTypes:true})){
    const p=join(folder,item.name).replaceAll('\\','/')
    if(item.isDirectory()){
      if(p.startsWith('src/skills/bundled')||p.startsWith('src/plugins/bundled'))continue
      walk(p)
    }else if(item.isFile()&&p.endsWith('.tsx'))paths.push(p)
  }
}
walk('src')
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function decodeMappings(raw){
  const lines=[];let source=0,line=0,col=0,name=0
  for(const part of raw.split(';')){
    let generatedCol=0
    const segments=[]
    for(const segment of part.split(',')){
      if(!segment)continue
      const nums=[];let value=0,shift=0
      for(const char of segment){
        const digit=alphabet.indexOf(char)
        if(digit<0)throw Error('Invalid base64 VLQ digit')
        value|=(digit&31)<<shift
        if(digit&32){shift+=5;continue}
        nums.push((value&1)?-(value>>1):value>>1);value=0;shift=0
      }
      if(!nums.length||shift)throw Error('Invalid source map VLQ segment')
      generatedCol+=nums[0]
      if(nums.length>=4){
        source+=nums[1];line+=nums[2];col+=nums[3]
        if(nums.length===5)name+=nums[4]
        if(source===0)segments.push({generatedCol,line,col})
      }
    }
    lines.push(segments)
  }
  return lines
}
const tokenNode=node=>ts.isStringLiteral(node)||ts.isJsxText(node)||
  ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateHead(node)||
  ts.isTemplateMiddle(node)||ts.isTemplateTail(node)
function tokens(ast){
  const list=[]
  function visit(node){if(tokenNode(node))list.push(node);ts.forEachChild(node,visit)}
  visit(ast)
  return list
}
const backtick=String.fromCharCode(96)
function quote(value,node,ast){
  const old=node.getText(ast)
  if(ts.isJsxText(node)){
    const head=old.match(/^\s*/)?.[0]||''
    const foot=old.match(/\s*$/)?.[0]||''
    return head+value.trim()+foot
  }
  if(ts.isNoSubstitutionTemplateLiteral(node))return backtick+value
    .replaceAll(backtick,'\\'+backtick).replaceAll('$'+'{','\\$'+'{')+backtick
  if(ts.isTemplateHead(node))return backtick+value.replaceAll(backtick,'\\'+backtick)+String.fromCharCode(36,123)
  if(ts.isTemplateMiddle(node))return '}'+value.replaceAll(backtick,'\\'+backtick)+String.fromCharCode(36,123)
  if(ts.isTemplateTail(node))return '}'+value.replaceAll(backtick,'\\'+backtick)+backtick
  const q=old.startsWith("'")?"'":'"'
  return q+value.replaceAll('\\','\\\\').replaceAll(q,'\\'+q)
    .replaceAll('\r','\\r').replaceAll('\n','\\n')+q
}
const accepted=[],rejected=[]
for(const path of paths){
  const file=readFileSync(resolve(root,path),'utf8')
  const match=file.match(inline)
  if(!match)continue
  try{
    const map=JSON.parse(Buffer.from(match[1],'base64').toString('utf8'))
    if(map.sources?.length!==1||map.sourcesContent?.length!==1||
       basename(map.sources[0])!==basename(path))continue
    const original=map.sourcesContent[0]
    if(typeof original!=='string'||!original.trim())continue
    const compiled=file.replace(inline,'')
    const phrases=[...new Set(compiled.match(chinese)||[])]
    const missingBefore=phrases.filter(s=>!original.includes(s))
    if(!missingBefore.length)continue
    const source=ts.createSourceFile(path,original,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
    const generated=ts.createSourceFile(path,file,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
    if(source.parseDiagnostics.length||generated.parseDiagnostics.length)
      throw Error('Parser diagnostics in candidate')
    const lines=decodeMappings(map.mappings)
    const originalTokens=tokens(source)
    const patches=new Map(),unmatched=[]
    for(const node of tokens(generated)){
      const value=node.text??node.getText(generated)
      const words=value.match(chinese)||[]
      if(!words.length||words.every(w=>original.includes(w)))continue
      const relativePosition=node.getText(generated).search(/[\u3400-\u9fff]/)
      const at=generated.getLineAndCharacterOfPosition(node.getStart(generated)+Math.max(0,relativePosition))
      const segment=(lines[at.line]||[]).filter(x=>x.generatedCol<=at.character).at(-1)
      if(!segment){unmatched.push({value:value.slice(0,80),reason:'no source mapping'});continue}
      const position=source.getLineStarts()[segment.line]+segment.col
      const matches=originalTokens
        .filter(target=>ts.isJsxText(node)===ts.isJsxText(target))
        .map(target=>{
          const start=target.getStart(source),end=target.getEnd()
          const distance=position<start?start-position:position>end?position-end:0
          const lineDistance=Math.abs(source.getLineAndCharacterOfPosition(start).line-segment.line)
          return {target,distance,lineDistance}
        }).filter(x=>x.distance<=180 && x.lineDistance<=6)
        .sort((a,b)=>a.distance-b.distance||a.lineDistance-b.lineDistance)
      if(!matches.length){unmatched.push({value:value.slice(0,80),reason:'no position-compatible original literal'});continue}
      const target=matches[0].target
      const text=quote(value,target,source)
      const key=target.getStart(source)+':'+target.getEnd()
      if(patches.has(key)&&patches.get(key).text!==text){
        unmatched.push({value:value.slice(0,80),reason:'conflicting original literal'});continue
      }
      patches.set(key,{start:target.getStart(source),end:target.getEnd(),text})
    }
    let restored=original
    for(const p of [...patches.values()].sort((a,b)=>b.start-a.start))
      restored=restored.slice(0,p.start)+p.text+restored.slice(p.end)
    const missing=phrases.filter(s=>!restored.includes(s))
    const check=ts.createSourceFile(path,restored,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
    if(missing.length||unmatched.length||check.parseDiagnostics.length||
       restored.includes('react/compiler-runtime')){
      rejected.push({path,missing:missing.slice(0,20),unmatched:unmatched.slice(0,15),
        parserErrors:check.parseDiagnostics.length,patched:patches.size})
      continue
    }
    const result=restored.endsWith('\n')?restored:restored+'\n'
    accepted.push({path,phrases:phrases.length,translated:patches.size,bytes:result.length})
    if(apply)writeFileSync(resolve(root,path),result)
  }catch(err){rejected.push({path,error:String(err)})}
}
const report={mode:apply?'apply':'preview',candidates:accepted.length+rejected.length,
  accepted:accepted.length,rejected:rejected.length,files:accepted,unresolved:rejected}
const reportPath=resolve(root,'.rebuild/governance/localized-original-tsx.json')
mkdirSync(dirname(reportPath),{recursive:true})
writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n')
console.log('[中文原始TSX恢复]',JSON.stringify({
  candidates:report.candidates,accepted:report.accepted,rejected:report.rejected,
  files:accepted.map(x=>({path:x.path,patched:x.translated})),
  blockers:rejected.map(x=>({path:x.path,error:x.error,missing:x.missing?.length,unmatched:x.unmatched?.length}))
}))
