import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { selectEligibleTips, selectLongestUnshown, resolveTipContent } from '../src/services/tips/tipEligibility.mjs'

const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const code=path=>readFileSync(resolve(root,path),'utf8')
const tip=(id, extra={})=>({
  id, cooldownSessions:0, providerAgnostic:true, isRelevant:async()=>true, ...extra,
})
const deps=(options={})=>{
  const failures=new Set()
  const reports=[]
  const env={
    isFirstPartyBackend:true,
    isCommandOffered:async()=>true,
    sessionsSinceShown:()=>Infinity,
    lifetimeShown:()=>0,
    hasFailed:id=>failures.has(id),
    markFailed:id=>failures.add(id),
    report:(error,kind)=>reports.push({error,kind}),
    ...options,
  }
  return {env,failures,reports}
}

test('first-party vs Bedrock/Vertex/Foundry/custom proxy filters are explicit',async()=>{
  const list=[tip('neutral'),tip('first-party',{providerAgnostic:false})]
  const first=deps(),external=deps({isFirstPartyBackend:false})
  assert.deepEqual((await selectEligibleTips(list,first.env)).map(x=>x.id),['neutral','first-party'])
  assert.deepEqual((await selectEligibleTips(list,external.env)).map(x=>x.id),['neutral'])
})
test('unavailable advertised slash command must never be displayed',async()=>{
  let checked=0
  const {env}=deps({isCommandOffered:async name=>{checked++;return name==='memory'}})
  const selected=await selectEligibleTips([
    tip('valid',{advertisedCommand:'memory'}),
    tip('invalid',{advertisedCommand:'agents'}),
    tip('not-advertising'),
  ],env)
  assert.deepEqual(selected.map(x=>x.id),['valid','not-advertising'])
  assert.equal(checked,2)
})
test('command checker exceptions report and mark failed for later turns',async()=>{
  let count=0
  const state=deps({isCommandOffered:async()=>{count++;throw new Error('unavailable-registry')}})
  const t=tip('bad',{advertisedCommand:'status'})
  assert.deepEqual(await selectEligibleTips([t],state.env),[])
  assert.equal(state.failures.has('bad'),true)
  assert.equal(state.reports[0].kind,'tip advertisedCommand check threw')
  assert.deepEqual(await selectEligibleTips([t],state.env),[])
  assert.equal(count,1)
})
test('relevance exception marks failed without failing all other tips',async()=>{
  const state=deps()
  const selected=await selectEligibleTips([
    tip('broken',{isRelevant:async()=>{throw new Error('broken relevance')}}),
    tip('good'),
  ],state.env)
  assert.deepEqual(selected.map(x=>x.id),['good'])
  assert.deepEqual([...state.failures],['broken'])
  assert.equal(state.reports[0].kind,'tip isRelevant threw')
})
test('cooldowns and lifetime caps are independently applied',async()=>{
  const state=deps({
    sessionsSinceShown:id=>id==='cooldown'?2:11,
    lifetimeShown:id=>id==='exhausted'?3:0,
  })
  const selected=await selectEligibleTips([
    tip('cooldown',{cooldownSessions:5}),
    tip('exhausted',{maxLifetimeShows:3}),
    tip('still-available',{maxLifetimeShows:3}),
  ],state.env)
  assert.deepEqual(selected.map(x=>x.id),['still-available'])
})
test('longest unshown wins, priority breaks ties, none remains undefined',()=>{
  const values=[tip('slow',{priority:99}),tip('priority',{priority:4}),tip('no-priority')]
  const since=id=>id==='slow'?3:9
  assert.equal(selectLongestUnshown(values,since).id,'priority')
  assert.equal(selectLongestUnshown([],since),undefined)
})
test('target selection is connected to the actual registry, scheduler and durable history',()=>{
  const registry=code('src/services/tips/tipRegistry.ts')
  const scheduler=code('src/services/tips/tipScheduler.ts')
  const history=code('src/services/tips/tipHistory.ts')
  assert.match(registry,/selectEligibleTips\(tips,/)
  assert.match(registry,/getCommands\(getOriginalCwd\(\)\)/)
  assert.match(registry,/isFirstPartyAnthropicBaseUrl\(\)/)
  assert.match(registry,/getTipLifetimeShows/)
  assert.match(scheduler,/selectLongestUnshown\(availableTips, getSessionsSinceLastShown\)/)
  assert.match(history, /\(c\.tipLifetimeShows\?\.\[tipId\] \?\? 0\) \+ 1/)
  assert.doesNotMatch(history,/history\\[tipId\\] === numStartups/)
  assert.match(history,/\\(c.tipLifetimeShows\\?\\.\\[tipId\\] \\?\\? 0\\) \\+ 1/)
})

test('content exceptions are recorded once and produce no rendered spinner text', async () => {
  const failed=[]
  const logged=[]
  const item={id:'crash',content:async()=>{throw Error('broken content')}}
  const output=await resolveTipContent(item,'dark',{
    markFailed:id=>failed.push(id),
    report:(error,kind)=>logged.push({kind,message:String(error)}),
  })
  assert.equal(output,'')
  assert.deepEqual(failed,['crash'])
  assert.equal(logged[0].kind,'tip content threw')
  assert.ok(logged[0].message.includes('broken content'))
})
test('content success preserves exact rendered string and does not mark failure', async () => {
  const state={failures:0}
  const result=await resolveTipContent({id:'ok',content:async()=> 'Displayed tip'},'dark',{
    markFailed:()=>{state.failures++},
    report:()=>{state.failures++},
  })
  assert.equal(result,'Displayed tip')
  assert.equal(state.failures,0)
})
test('actual REPL records a tip only when content rendered, errors clear spinner',()=>{
  const source=code('src/screens/REPL.tsx')
  assert.match(source,/await getSafeTipContent\(tip, theme\)/)
  assert.match(source,/if \(content !== ''\)/)
  assert.match(source,/recordShownTip\(tip\)/)
  assert.match(source,/spinner tip failed/)
})
