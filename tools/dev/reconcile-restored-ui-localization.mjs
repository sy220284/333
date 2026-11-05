#!/usr/bin/env node
/**
 * Reconcile original TSX restoration with user-visible Simplified-Chinese UI.
 * The 199-file recovery commit replaced some postcompile localized strings
 * with older English originals from inline source maps. Detect exact lost
 * Chinese phrases and restore only those components from their audited parent.
 * Changes made after the bulk restore are explicitly listed as conflicts.
 */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync, spawnSync} from 'node:child_process'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const recovery='40b5645c86c9b06b2d547fa92e2287f0de2c6c50'
const predecessor='81aead9ee690ba3655630b36a8fb72357e7ee741'
const git=(args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024})
const files=git(['diff-tree','--no-commit-id','--name-only','-r',recovery])
  .split('\n').filter(p=>p.endsWith('.tsx'))
const oldView=text=>text.split(/\/\/[#@]\s*sourceMappingURL=/)[0]
const han=text=>new Set(oldView(text).match(/[\u3400-\u9fff]{2,}/g)??[])
const restored=[], already=[], edited=[], unaffected=[]
for(const path of files) {
  const current=readFileSync(resolve(root,path),'utf8')
  const previous=git(['show',predecessor+':'+path])
  const lost=[...han(previous)].filter(phrase=>!oldView(current).includes(phrase))
  if(lost.length===0){unaffected.push(path);continue}
  const diff=spawnSync('git',['diff','--quiet',recovery,'HEAD','--',path],{cwd:root})
  if(diff.status===1){edited.push({path,missingPhrases:lost.length,reason:'file-changed-after-recovery'});continue}
  if(diff.status!==0)throw new Error('Cannot verify subsequent source changes: '+path)
  writeFileSync(resolve(root,path),previous)
  restored.push({path,missingPhrases:lost.length})
}
const report={
  recoveryCommit:recovery,verifiedParent:predecessor,reviewed:files.length,
  restored:restored.length,unaffected:unaffected.length,conflicts:edited.length,
  restoredDetails:restored,conflictDetails:edited,unaffectedPaths:unaffected,
}
const out=resolve(root,'.rebuild/governance/ui-localization-reconciliation.json')
mkdirSync(dirname(out),{recursive:true})
writeFileSync(out,JSON.stringify(report,null,2)+'\n')
console.log('[中文UI回写修复]',JSON.stringify({
  reviewed:files.length,restored:restored.length,
  unaffected:unaffected.length,conflicts:edited.length,
  paths:restored.map(x=>x.path)
}))
if(edited.length)throw new Error('Found post-recovery UI edits requiring merge: '+JSON.stringify(edited))
