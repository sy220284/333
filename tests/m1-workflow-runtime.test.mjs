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
