#!/usr/bin/env node
/** Read the product-specific acceptance scope while retaining all official
 * release-note evidence. Classification never marks a feature implemented. */
import { readFileSync } from 'node:fs'

const matrixFile = new URL('../docs/upgrade/m1-evidence/2.1.317-392项完整功能链路分组矩阵.json',import.meta.url)
const scopeFile = new URL('../docs/upgrade/m1-evidence/2.1.317-392项产品保留适配与退役判定.json',import.meta.url)
const source = JSON.parse(readFileSync(matrixFile,'utf8'))
const scope = JSON.parse(readFileSync(scopeFile,'utf8'))
const byId = new Map(scope.decisions.map(item => [item.id,item]))
const dispositions = new Set(['RETAIN_OFFICIAL_PARITY','ADAPT_TO_LOCAL_EQUIVALENT','EXCLUDE_RETIRED_FEATURE'])

function verify() {
  if (source.total !== 392 || source.items.length !== source.total ||
      scope.decisions.length !== source.total || byId.size !== source.total) {
    throw new Error('官方392项追踪和产品范围没有完整一一对应')
  }
  const counts = {}
  for (const item of source.items) {
    const decision=byId.get(item.id)
    if (!decision || decision.official_update !== item.official_text) {
      throw new Error(`产品范围缺少原版更新或原文发生变化：${item.id}`)
    }
    if (!dispositions.has(decision.disposition) || !decision.decision_reason || !decision.acceptance) {
      throw new Error(`产品范围没有明确验收口径：${item.id}`)
    }
    if (decision.disposition === 'EXCLUDE_RETIRED_FEATURE' &&
      decision.implementation_gate !== 'RETIRED_NO_IMPLEMENTATION') {
      throw new Error(`官方退役能力错误纳入实现门禁：${item.id}`)
    }
    counts[decision.disposition]=(counts[decision.disposition]||0)+1
  }
  if (JSON.stringify(counts)!==JSON.stringify(scope.scope_counts) ||
    (counts.RETAIN_OFFICIAL_PARITY + counts.ADAPT_TO_LOCAL_EQUIVALENT)!==scope.active_acceptance_count) {
    throw new Error('范围分类计数与真实验收范围不符')
  }
  return counts
}
const counts=verify()
const modeIndex=process.argv.indexOf('--mode')
const mode=modeIndex>=0?process.argv[modeIndex+1]:'summary'
const idIndex=process.argv.indexOf('--id')
const requestedId=idIndex>=0?process.argv[idIndex+1]:undefined
const category={
  retained:'RETAIN_OFFICIAL_PARITY',
  adapted:'ADAPT_TO_LOCAL_EQUIVALENT',
  retired:'EXCLUDE_RETIRED_FEATURE',
}
if (!['summary','active','all','retained','adapted','retired'].includes(mode)) {
  throw new Error(`未知产品范围：${mode}`)
}
if (idIndex>=0 && !requestedId) throw new Error('请在 --id 后提供官方更新编号')
let selected=scope.decisions
if(mode==='active')selected=selected.filter(item=>item.disposition!=='EXCLUDE_RETIRED_FEATURE')
else if(category[mode])selected=selected.filter(item=>item.disposition===category[mode])
if(requestedId)selected=selected.filter(item=>item.id===requestedId)
if(requestedId && selected.length===0)throw new Error(`当前范围找不到官方更新：${requestedId}`)
if(process.argv.includes('--check')){
  process.stdout.write(`392/392 官方来源已匹配；原版对齐 ${counts.RETAIN_OFFICIAL_PARITY}；本地适配 ${counts.ADAPT_TO_LOCAL_EQUIVALENT}；退役验证 ${counts.EXCLUDE_RETIRED_FEATURE}。\n`)
} else if(process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({total:scope.decisions.length,counts,mode,selected},null,2)+'\n')
} else if(mode==='summary'&&!requestedId) {
  process.stdout.write(`官方更新 392：保留原版 ${counts.RETAIN_OFFICIAL_PARITY}，本地适配 ${counts.ADAPT_TO_LOCAL_EQUIVALENT}，官方退役 ${counts.EXCLUDE_RETIRED_FEATURE}。\n产品需实施与验收 ${scope.active_acceptance_count} 条，退役与隐私护栏检查 ${scope.excluded_count} 条。\n`)
} else {
  for(const item of selected)process.stdout.write(`${item.id} [${item.disposition}] ${item.local_contract}\n`)
}
