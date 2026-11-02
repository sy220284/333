#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const files=[]
function visit(dir) {
  for (const e of readdirSync(dir,{withFileTypes:true})) {
    const path=join(dir,e.name)
    if (e.isDirectory()) visit(path)
    else if (/\.(tsx?|jsx?)$/.test(e.name)) files.push(path)
  }
}
for(const dir of ['src/components','src/commands','src/hooks']) visit(dir)
const patterns=[
  ['JSX可见文字',/>\s*([A-Z][A-Za-z ,:.!?()\-]{6,})(?=<)/g],
  ['界面属性',/\b(?:label|title|placeholder|headerText|helpText|emptyMessage|description|subtitle)\s*[:=]\s*(['"])([A-Z][A-Za-z ,:.!?()\-]{5,})\1/g],
  ['静态提示',/\b(?:value|message)\s*:\s*(['"])([A-Z][A-Za-z ,:.!?()\-]{9,})\1/g]
]
const rows=[]
for(const path of files) {
  const lines=readFileSync(path,'utf8').split('//# sourceMappingURL=')[0].split('\n')
  for(const [i,line] of lines.entries()) {
    if(/^\s*(\/\/|\/\*|\*|import |export type |type |interface )/.test(line))continue
    for(const [kind,re] of patterns) {
      re.lastIndex=0
      for(const hit of line.matchAll(re)) {
        const word=(kind==='JSX可见文字'?hit[1]:hit[2]).trim()
        if(word.length>=7)rows.push({path,line:i+1,kind,text:word.slice(0,130)})
      }
    }
  }
}
const counts=new Map()
for(const r of rows)counts.set(r.path,(counts.get(r.path)||0)+1)
const top=[...counts].sort((a,b)=>b[1]-a[1])
const report={scannedFiles:files.length,flaggedStrings:rows.length,filesWithFindings:counts.size,topFiles:top,findings:rows}
writeFileSync('.localization-audit.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({scannedFiles:report.scannedFiles,flaggedStrings:report.flaggedStrings,filesWithFindings:report.filesWithFindings,topFiles:top.slice(0,40)},null,2))
for(const r of rows)console.log(r.path+':'+r.line+' ['+r.kind+'] '+r.text)
