#!/usr/bin/env node
/**
 * Repair localized UI lost when older embedded TSX source maps were restored.
 * The previous compiled TSX is an exact, tested copy of the visible Chinese UI.
 * Revert only files that lost Chinese strings, and only when no newer change
 * touched the file after the original TSX recovery commit.
 */
import {execFileSync,spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const before='81aead9ee690ba3655630b36a8fb72357e7ee741'
const restored='40b5645c86c9b06b2d547fa92e2287f0de2c6c50'
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024})
git(['merge-base','--is-ancestor',restored,'HEAD'])
const paths=git(['diff','--name-only',before,restored,'--','src']).split(/\r?\n/)
  .filter(x=>/\.tsx?$/.test(x))
const repaired=[],protectedPaths=[],unchanged=[]
for(const path of paths){
  const old=git(['show',before+':'+path])
  const current=readFileSync(resolve(root,path),'utf8')
  const uiCode=old.split(/\/\/[#@]\s*sourceMappingURL=data:/)[0]
  const chinese=[...new Set(uiCode.match(/[\u3400-\u9fff]{2,}/g)||[])]
  const lost=chinese.filter(text=>!current.includes(text))
  if(!lost.length){unchanged.push(path);continue}
  const changed=spawnSync('git',['diff','--quiet',restored,'HEAD','--',path],{cwd:root})
  if(changed.status!==0){
    protectedPaths.push({path,missingChinese:lost,reason:'changed-after-verified-restore'})
    continue
  }
  // Preserve the tested, already-localized component until its original TSX
  // can be relocalized and verified. No generated replacement components.
  writeFileSync(resolve(root,path),old)
  repaired.push({path,restoredPhrases:lost.length})
}
const report={baseline:before,restore:restored,head:git(['rev-parse','HEAD']).trim(),
  inspected:paths.length,alreadySafe:unchanged.length,repaired:repaired.length,
  blocked:protectedPaths.length,repairedFiles:repaired,blockedFiles:protectedPaths}
const out=resolve(root,'.rebuild/governance/tsx-localization-repair.json')
mkdirSync(dirname(out),{recursive:true})
writeFileSync(out,JSON.stringify(report,null,2)+'\n')
console.log('[恢复中文界面]',JSON.stringify({
  inspected:report.inspected,repaired:report.repaired,blocked:report.blocked,
  paths:repaired.map(x=>x.path)
}))
if(protectedPaths.length)throw new Error('Newer UI changes require manual reconciliation: '+JSON.stringify(protectedPaths))
if(repaired.length===0)console.log('[恢复中文界面] no changes needed')
