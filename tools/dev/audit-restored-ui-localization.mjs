#!/usr/bin/env node
/**
 * Check every UI file restored by the verified 199-file TSX batch against
 * the actual localized UI in the parent commit. Fails when Chinese-facing
 * copy vanishes, even if the TypeScript compiler and runtime build pass.
 */
import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const before='81aead9ee690ba3655630b36a8fb72357e7ee741'
const recovered='40b5645c86c9b06b2d547fa92e2287f0de2c6c50'
const git=(args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024})
git(['merge-base','--is-ancestor',recovered,'HEAD'])
const paths=git(['diff','--name-only',before,recovered,'--','src']).split(/\r?\n/)
  .filter(p=>/\.tsx?$/.test(p))
const issues=[],scanned=[]
for(const path of paths){
  const full=resolve(root,path)
  if(!existsSync(full)) {issues.push({path,reason:'removed-after-recovery'});continue}
  const earlier=git(['show',before+':'+path])
  const current=readFileSync(full,'utf8')
  const compiled=earlier.split(/\/\/[#@]\s*sourceMappingURL=data:/)[0]
  const originalPhrases=[...new Set(compiled.match(/[\u3400-\u9fff]{2,}/g)||[])]
  const disappeared=originalPhrases.filter(phrase=>!current.includes(phrase))
  scanned.push({path,previousChinesePhrases:originalPhrases.length,missing:disappeared.length})
  if(disappeared.length)issues.push({path,reason:'lost-original-zh-ui-copy',phrases:disappeared})
}
const report={before,recovered,revision:git(['rev-parse','HEAD']).trim(),
  inspected:paths.length,filesWithMissingCopy:issues.length,issues,scanned}
const output=resolve(root,'.rebuild/governance/tsx-localization-regression.json')
mkdirSync(dirname(output),{recursive:true})
writeFileSync(output,JSON.stringify(report,null,2)+'\n')
console.log('[原始TSX中文本地化核验]',JSON.stringify({
  inspected:paths.length,missingFiles:issues.length,missingDetails:issues.slice(0,100)
}))
if(issues.length)process.exitCode=1
