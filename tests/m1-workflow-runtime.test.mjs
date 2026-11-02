import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateWorkflowScript,executeWorkflowScript} from '../src/tools/WorkflowTool/workflowRuntime.mjs'
const script=`export const meta={name:'review',description:'Check code',phases:[{title:'Scan',detail:'Review'}]}
phase('Scan')
const results=await parallel([()=>agent('first'),()=>agent('second')])
log(results.join(','))`
test('Workflow validates metadata and deterministic scripts',()=>{
 const parsed=validateWorkflowScript(script);assert.equal(parsed.meta.name,'review')
 assert.throws(()=>validateWorkflowScript(script+'\nDate.now()'),/deterministic/)
 assert.throws(()=>validateWorkflowScript('agent("hello")'),/requires export/)
})
test('Workflow meta is parsed as literal data, without executing expressions before approval',()=>{
  const malicious=`export const meta={name:this.constructor.constructor('return process')().version,description:'unsafe'}`
  assert.throws(()=>validateWorkflowScript(malicious),/static literal/)
  const getter=`export const meta={get name(){throw Error('executed')},description:'unsafe'}`
  assert.throws(()=>validateWorkflowScript(getter),/static literal/)
  const allowed=`export const meta={name:'secure',description:'Static fields',phases:[{title:'Audit',detail:'Check code'}]}`
  assert.equal(validateWorkflowScript(allowed).meta.phases[0].title,'Audit')
})
test('Workflow runs phase and parallel callbacks then logs results',async()=>{
 const called=[],phases=[],logs=[]
 await executeWorkflowScript({script,agent:async prompt=>{called.push(prompt);return prompt.toUpperCase()},
  onPhase:name=>phases.push(name),onLog:line=>logs.push(line)})
 assert.deepEqual(called,['first','second']);assert.deepEqual(phases,['Scan']);assert.deepEqual(logs,['FIRST,SECOND'])
})
test('Workflow refuses cancelled run before dispatch',async()=>{
 const ac=new AbortController();ac.abort()
 await assert.rejects(()=>executeWorkflowScript({script,signal:ac.signal,agent:async()=>{throw Error('called')}}),/cancelled/)
})

test('Workflow accepts JSON arrays and scalar args unchanged',async()=>{
 const run=`export const meta={name:'args',description:'JSON types'}
 log(Array.isArray(args)?args.join('|'):String(args))`
 const got=[]
 await executeWorkflowScript({script:run,args:['a','b'],agent:async()=>'',onLog:s=>got.push(s)})
 await executeWorkflowScript({script:run,args:'one',agent:async()=>'',onLog:s=>got.push(s)})
 assert.deepEqual(got,['a|b','one'])
})
test('Workflow script limit matches official x64 524288 characters',()=>{
 const prefix="export const meta={name:'max',description:'boundary'}\n"
 assert.doesNotThrow(()=>validateWorkflowScript(prefix+' '.repeat(524288-prefix.length)))
 assert.throws(()=>validateWorkflowScript(prefix+' '.repeat(524289-prefix.length)),/524288/)
})

test('Workflow host constructors cannot escape into the parent process',async()=>{
  const source=`export const meta={name:'escape',description:'Check isolation'}
const host=agent.constructor.constructor('return process')()
log(host.version)`
  await assert.rejects(()=>executeWorkflowScript({script:source,agent:async()=>''}),/Code generation from strings disallowed|not allowed/i)
})
test('Workflow args and Agent results are sandbox-owned objects',async()=>{
  const source=`export const meta={name:'isolate',description:'Object isolation'}
const received=await agent('respond')
const host1=args.constructor.constructor('return process')()
log(host1.version)
const host2=received.constructor.constructor('return process')()
log(host2.version)`
  await assert.rejects(()=>executeWorkflowScript({script:source,args:{x:1},agent:async()=>({safe:true})}),/Code generation from strings disallowed|not allowed/i)
})

test('Workflow supports optional phase detail exactly like 2.1.310',async()=>{
 const script=`export const meta={name:'phase-optional',description:'Stage control',phases:[{title:'Review'},{title:'Verify',detail:'Confirm'}]}
 phase('Review'); phase('Verify')`
 const phases=[]
 await executeWorkflowScript({script,agent:async()=>'',onPhase:phase=>phases.push(phase)})
 assert.deepEqual(phases,['Review','Verify'])
})
test('Workflow enforces declared phase titles and prevents forged progress',async()=>{
 const script=`export const meta={name:'phase-strict',description:'Stage control',phases:[{title:'Review'}]}
 phase('Complete')`
 await assert.rejects(()=>executeWorkflowScript({script,agent:async()=>''}),/Undeclared workflow phase/)
})

test('Workflow does not expose host errors through overridden sandbox String',async()=>{
  const source=`export const meta={name:'error-boundary',description:'Isolate agent error'}
globalThis.String=(error)=>{const p=error.constructor.constructor('return process')();return p.version}
await agent('fail')`
  await assert.rejects(()=>executeWorkflowScript({script:source,agent:async()=>{throw new Error('host-agent-rejected')}}),/host-agent-rejected/)
})
test('Workflow phase and log callback errors stay on the host side of the JSON bridge',async()=>{
  for(const mode of ['phase','log']){
    const body=mode==='phase'?"phase('Audit')":"log('Audit')"
    const source=`export const meta={name:'event-boundary',description:'Isolate event error'}
globalThis.String=(error)=>{if(error&&typeof error==='object'){const p=error.constructor.constructor('return process')();return p.version}return ''+error}
${body}`
    const options={script:source,agent:async()=>'',onPhase:()=>{throw new Error('host-phase-rejected')},
      onLog:()=>{throw new Error('host-log-rejected')}}
    await assert.rejects(()=>executeWorkflowScript(options),new RegExp('host-'+mode+'-rejected'))
  }
})

test('Workflow preserves its final JSON result, including a pure script with no agents',async()=>{
 const script=`export const meta={name:'return-test',description:'Result'}
 phase('Verify')
 return {answer:42,done:true}`
 const completion=await executeWorkflowScript({script,agent:async()=>''})
 assert.deepEqual(completion.result,{answer:42,done:true})
})
test('Workflow pipeline returns the final result without losing concurrent agent responses',async()=>{
 const script=`export const meta={name:'pipeline-result',description:'Result'}
 const results=await parallel([()=>agent('a'),()=>agent('b')])
 return results.join(',')`
 const completion=await executeWorkflowScript({script,agent:async prompt=>prompt.toUpperCase()})
 assert.equal(completion.result,'A,B')
})

test('Workflow permission policy preserves real x64 bypass mode while normal and auto require review',async()=>{
 const {readFile}=await import('node:fs/promises')
 const source=await readFile(new URL('../src/tools/WorkflowTool/WorkflowTool.ts',import.meta.url),'utf8')
 assert.match(source,/permissions\.mode==='bypassPermissions'/)
 assert.match(source,/behavior:'allow' as const,updatedInput:frozen/)
 assert.match(source,/behavior:'ask' as const/)
 assert.match(source,/classifierApprovable:false/)
})
