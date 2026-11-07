#!/usr/bin/env node
/**
 * Evidence report for the complete 2.1.311—2.1.317 upgrade ledger.
 *
 * Code/test presence is a candidate, NEVER proof of passing behavior.
 * A change can be formally accepted only after same-SHA executable evidence,
 * official-differential review, and explicit chain sign-off.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function load(path) {
  return JSON.parse(readFileSync(resolve(root,path), 'utf8'))
}
const input = {
  ledger:'docs/upgrade/m1-evidence/2.1.311-2.1.317-官方逐条变更与验收台账.json',
  routes:'docs/upgrade/m1-evidence/2.1.317-392项完整功能链路分组矩阵.json',
  scope:'docs/upgrade/m1-evidence/2.1.317-392项产品保留适配与退役判定.json',
  snapshot:'docs/upgrade/m1-evidence/2.1.317-392项逐条代码级实证审计_20261107.json',
  delta:'docs/upgrade/m1-evidence/2.1.317-增量代码与测试证据.json',
  signoffs:'docs/upgrade/2.1.317-功能链路签收.json',
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
function unique(array, label) {
  const set=new Set(array)
  assert(set.size===array.length, `${label} has duplicate entries`)
  return set
}
function fileExists(path) {
  return typeof path === 'string' &&
    !path.startsWith('/') && !path.split('/').includes('..') &&
    existsSync(resolve(root,path))
}
export function reportUpgrade317() {
  const ledger=load(input.ledger), routes=load(input.routes), scope=load(input.scope)
  const snapshot=load(input.snapshot), delta=load(input.delta), signoffs=load(input.signoffs)
  assert(ledger.entries.length===392 && routes.items.length===392 && scope.decisions.length===392,
    '392 upstream changes must be preserved exactly')
  assert(snapshot.entries.length===392, 'frozen source audit must preserve the 392 item baseline')
  const sourceIds=ledger.entries.map(item=>item.id)
  unique(sourceIds,'upstream ledger')
  assert(sourceIds.every((id,index)=>routes.items[index].id===id && scope.decisions[index].id===id),
    'ledger, chain and product scope must have the same ordered IDs')
  const counts=Object.fromEntries(['RETAIN_OFFICIAL_PARITY','ADAPT_TO_LOCAL_EQUIVALENT','EXCLUDE_RETIRED_FEATURE'].map(
    type=>[type,scope.decisions.filter(item=>item.disposition===type).length]))
  assert(counts.RETAIN_OFFICIAL_PARITY===scope.scope_counts.RETAIN_OFFICIAL_PARITY,
    'retained count does not match product scope')
  assert(counts.ADAPT_TO_LOCAL_EQUIVALENT===scope.scope_counts.ADAPT_TO_LOCAL_EQUIVALENT,
    'adapted count does not match product scope')
  assert(counts.EXCLUDE_RETIRED_FEATURE===scope.scope_counts.EXCLUDE_RETIRED_FEATURE,
    'retired count does not match product scope')
  assert(counts.RETAIN_OFFICIAL_PARITY+counts.ADAPT_TO_LOCAL_EQUIVALENT+counts.EXCLUDE_RETIRED_FEATURE===392,
    'classification has missing items')
  unique(delta.items.map(item=>item.id),'incremental evidence')
  const currentScope=new Map(scope.decisions.map(item=>[item.id,item.disposition]))
  const increment=new Map()
  for (const item of delta.items) {
    const disposition=currentScope.get(item.id)
    assert(disposition,`unknown delta item ${item.id}`)
    const retirement=item.stage==='RETIREMENT_BOUNDARY_CODE_TEST_PRESENT'
    const implemented=item.stage==='IMPLEMENTED_PENDING_RUNTIME'
    assert(retirement||implemented,`unrecognized candidate stage for ${item.id}`)
    assert(retirement === (disposition==='EXCLUDE_RETIRED_FEATURE'),
      `evidence stage conflicts with product scope for ${item.id}`)
    assert(Array.isArray(item.production_files) && item.production_files.length>0 &&
      Array.isArray(item.tests) && item.tests.length>0,`source or tests missing for ${item.id}`)
    unique(item.production_files,`sources of ${item.id}`)
    unique(item.tests,`tests of ${item.id}`)
    for (const path of [...item.production_files,...item.tests]) {
      assert(fileExists(path),`referenced source/test file missing for ${item.id}: ${path}`)
    }
    assert(item.runtime_evidence===null,
      `runtime evidence requires separate same-SHA validated signoff, not an unverified JSON value for ${item.id}`)
    increment.set(item.id,item)
  }
  assert(Array.isArray(signoffs.chains),'chain signoff file must contain chains array')
  const chainById=new Map(routes.items.map(item=>[item.id,item.chain]))
  const frozenById=new Map(snapshot.entries.map(item=>[item.id,item]))
  const candidates=sourceIds.map(id=>{
    const historical=frozenById.get(id)
    assert(historical,`frozen baseline missing ${id}`)
    const proposal=increment.get(id)
    return {
      id,chain:chainById.get(id),scope:currentScope.get(id),
      historic_code_grade:historical.code_grade,
      current_evidence_grade:proposal?.stage ?? historical.code_grade,
      runtime_verified:false,
      formally_signed:false,
      ...(proposal&&{production_files:proposal.production_files,tests:proposal.tests}),
    }
  })
  const candidateWired=new Set(candidates.filter(x=>x.historic_code_grade==='SOURCE_WIRED_TEST_PRESENT').map(x=>x.id))
  for (const item of delta.items) if (item.stage==='IMPLEMENTED_PENDING_RUNTIME') candidateWired.add(item.id)
  const byChain={}
  for (const entry of candidates) {
    const chain=entry.chain ?? 'UNCLASSIFIED'
    if (!byChain[chain]) byChain[chain] = {total:0,incremental_candidates:0}
    const row=byChain[chain]
    row.total++
    if (increment.has(entry.id)) row.incremental_candidates++
  }
  return {
    source_version:'2.1.317',
    total:candidates.length,
    scope_counts:counts,
    baseline_code_wired:snapshot.code_wired_confirmed,
    source_and_test_candidates:candidateWired.size,
    incremental_candidates:delta.items.length,
    incremental_implementation_candidates:delta.items.filter(item=>item.stage==='IMPLEMENTED_PENDING_RUNTIME').length,
    incremental_retirement_candidates:delta.items.filter(item=>item.stage==='RETIREMENT_BOUNDARY_CODE_TEST_PRESENT').length,
    runtime_verified:0,
    formal_item_signoffs:0,
    signed_chains:signoffs.chains.length,
    by_chain:byChain,
    items:candidates,
  }
}

const invoked=process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)
if (invoked) {
  try {
    const result=reportUpgrade317()
    if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(result,null,2)}\n`)
    else {
      const {items,...summary}=result
      process.stdout.write(`${JSON.stringify(summary,null,2)}\n`)
    }
  } catch (error) {
    process.stderr.write(`升级证据核验失败：${error instanceof Error?error.message:String(error)}\n`)
    process.exitCode=1
  }
}
