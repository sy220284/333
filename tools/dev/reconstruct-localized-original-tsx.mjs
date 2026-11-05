#!/usr/bin/env node
/**
 * Rebuild typed TSX while preserving user-facing Chinese strings. Generated
 * and original AST textual nodes are aligned through the embedded source-map
 * VLQ positions. Ambiguous files remain unchanged and get a diagnostic record.
 */
import ts from 'typescript'
import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,dirname,join,basename} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const apply=process.argv.includes('--apply')
const tolerance=Number(process.env.UI_MAP_MAX_OFFSET??70)
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const inline=/\/\/[#@]\s*sourceMappingURL=data:application\/json(?:;charset=utf-8)?;base64,([A-Za-z0-9+/=]+)\s*$/
const phrases=str=>[...new Set(str.match(/[\u3400-\u9fff]{2,}/g)||[])]
function vlq(segment){
  let acc=0,shift=0,result=[]
  for(const c of segment){
    let v=alphabet.indexOf(c)
    if(v<0)throw Error('Invalid source map')
    const more=(v&32)!==0
    acc+=(v&31)*2**shift
    if(more){shift+=5;continue}
    result.push(acc&1?-(acc>>1):(acc>>1))
    acc=0;shift=0
  }
  return result
}
function decode(mappings){
  let src=0,line=0,col=0
  return mappings.split(';').map(row=>{
    let gen=0
    const list=[]
    for(const segment of row.split(',')){
      if(!segment)continue
      const v=vlq(segment)
      gen+=v[0]
      if(v.length>=4){
        src+=v[1];line+=v[2];col+=v[3]
        list.push({gen,src,line,col})
      }
    }
    return list
  })
}
function textual(sf){
  const result=[]
  function walk(node){
    if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isJsxText(node)){
      result.push({start:node.getStart(sf),end:node.end,text:node.text,
        kind:ts.isJsxText(node)?'jsx':ts.isStringLiteral(node)?'string':'template'})
    }
    ts.forEachChild(node,walk)
  }
  walk(sf)
  return result
}
function transfer(path,input){
  const m=input.match(inline)
  if(!m)return {ok:false,reason:'missing-map'}
  const map=JSON.parse(Buffer.from(m[1],'base64').toString('utf8'))
  if(map.sources?.length!==1||map.sourcesContent?.length!==1||
    basename(map.sources[0])!==basename(path))return {ok:false,reason:'unmatched-source'}
  const original=map.sourcesContent[0],generated=input.slice(0,m.index)
  const oldAst=ts.createSourceFile(path,original,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  const newAst=ts.createSourceFile(path,generated,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  if(oldAst.parseDiagnostics.length||newAst.parseDiagnostics.length)return {ok:false,reason:'parse-error'}
  const oldText=textual(oldAst),newText=textual(newAst)
  const mapping=decode(map.mappings),initial=phrases(generated)
  const missing=initial.filter(p=>!original.includes(p))
  if(!missing.length)return {ok:false,reason:'already-localized'}
  const writes=new Map(),unmapped=[]
  for(const node of newText){
    const ch=phrases(node.text)
    if(!ch.length||ch.every(p=>original.includes(p)))continue
    const pos=newAst.getLineAndCharacterOfPosition(node.start)
    const trace=[...(mapping[pos.line]||[])].reverse()
      .find(x=>x.src===0&&x.gen<=pos.character)
    if(!trace){unmapped.push({text:node.text.slice(0,65),reason:'missing-map-position'});continue}
    const at=oldAst.getPositionOfLineAndCharacter(trace.line,trace.col)
    const found=oldText.map(candidate=>({...candidate,
      distance:at<candidate.start?candidate.start-at:at>candidate.end?at-candidate.end:0}))
      .filter(candidate=>candidate.distance<=tolerance)
      .sort((a,b)=>a.distance-b.distance||
        Number(a.kind!==node.kind)-Number(b.kind!==node.kind))
    const target=found[0]
    if(!target || (found.length>1&&found[1].distance===target.distance&&
        found[1].kind===target.kind&&found[1].start!==target.start)){
      unmapped.push({text:node.text.slice(0,65),reason:'ambiguous-source-position'})
      continue
    }
    let value
    if(target.kind==='jsx'){
      const raw=original.slice(target.start,target.end)
      value=(raw.match(/^\s*/)?.[0]||'')+node.text.trim().replaceAll('<','&lt;')+
        (raw.match(/\s*$/)?.[0]||'')
    }else if(target.kind==='string')value=JSON.stringify(node.text)
    else{
      unmapped.push({text:node.text.slice(0,65),reason:'template-needs-manual-port'})
      continue
    }
    const previous=writes.get(target.start)
    if(previous&&previous.value!==value){
      unmapped.push({text:node.text.slice(0,65),reason:'conflicting-translations'})
      continue
    }
    writes.set(target.start,{start:target.start,end:target.end,value,
      from:target.text.slice(0,75),to:node.text.slice(0,75),distance:target.distance})
  }
  let output=original
  const changes=[...writes.values()].sort((a,b)=>b.start-a.start)
  for(const v of changes)output=output.slice(0,v.start)+v.value+output.slice(v.end)
  const ast=ts.createSourceFile(path,output,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  if(ast.parseDiagnostics.length)return {ok:false,reason:'translated-parse-error',
    errors:ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).slice(0,5)}
  const absent=initial.filter(p=>!output.includes(p))
  return {ok:unmapped.length===0&&absent.length===0,
    reason:unmapped.length?'inexact-source-map':absent.length?'missing-zh-copy':null,
    changes:changes.length,missingBefore:missing.length,unmapped,
    missingAfter:absent,output,transfers:changes.map(v=>({from:v.from,to:v.to,distance:v.distance}))}
}
const targets=[]
function scan(dir){
  for(const item of readdirSync(resolve(root,dir),{withFileTypes:true})){
    const path=join(dir,item.name).replaceAll('\\','/')
    if(item.isDirectory()){
      if(path.startsWith('src/skills/bundled')||path.startsWith('src/plugins/bundled'))continue
      scan(path)
    }else if(item.isFile()&&path.endsWith('.tsx'))targets.push(path)
  }
}
scan('src')
const entries=[]
for(const path of targets){
  const input=readFileSync(resolve(root,path),'utf8')
  if(!inline.test(input))continue
  const match=input.match(inline)
  if(!phrases(input.slice(0,match.index)).length)continue
  let result
  try{result=transfer(path,input)}catch(e){result={ok:false,reason:'exception',error:String(e)}}
  const {output,...summary}=result
  entries.push({path,...summary})
  if(apply&&result.ok)writeFileSync(resolve(root,path),output.endsWith('\n')?output:output+'\n')
}
const report={mode:apply?'apply':'preview',scanned:entries.length,
  ready:entries.filter(x=>x.ok).length,transfers:entries.filter(x=>x.ok).reduce((n,x)=>n+x.changes,0),
  files:entries}
const dest=resolve(root,'.rebuild/governance/localized-original-tsx-reconstruction.json')
mkdirSync(dirname(dest),{recursive:true})
writeFileSync(dest,JSON.stringify(report,null,2)+'\n')
console.log('[中文界面原始TSX重构]',JSON.stringify({
  mode:report.mode,scanned:report.scanned,ready:report.ready,transfers:report.transfers,
  rejected:entries.filter(x=>!x.ok).map(x=>({path:x.path,reason:x.reason,
    unmapped:x.unmapped?.length,missing:x.missingAfter?.length})).slice(0,60)
}))
