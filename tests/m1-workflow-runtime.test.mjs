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
