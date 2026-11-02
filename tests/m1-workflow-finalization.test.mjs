import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createWorkflowSummaryRecorder} from '../src/tasks/LocalWorkflowTask/workflowSummaryStore.mjs'

test('Workflow cancellation seals the record against late phase and completion writes',async()=>{
 const writes=[]
 const writer=createWorkflowSummaryRecorder('/tmp/unused.json',{status:'running',workflowProgress:[]},{
  write:async(_,value)=>{writes.push(structuredClone(value))}
 })
 await writer.update({workflowProgress:[{title:'Scanning'}]})
 await writer.finish({status:'killed',error:'stopped'})
 await writer.update({status:'completed',result:'should not be published'})
 await writer.update({workflowProgress:[{title:'Late callback'}]})
 await writer.finish({status:'failed'})
 assert.deepEqual(writes.map(w=>w.status),['running','killed'])
 assert.equal(writer.snapshot.status,'killed')
 assert.deepEqual(writer.snapshot.workflowProgress,[{title:'Scanning'}])
 assert.equal(writer.finished,true)
})
test('Workflow writes are ordered even when I/O completes out of order',async()=>{
 const seen=[]
 const writer=createWorkflowSummaryRecorder('/tmp/unused.json',{status:'running'},{
  write:async(_,value)=>{
   await new Promise(resolve=>setTimeout(resolve,value.stage===1?5:0))
   seen.push(value.stage)
  },
 })
 const first=writer.update({stage:1})
 const second=writer.update({stage:2})
 const terminal=writer.finish({status:'completed',stage:3,result:{answer:42}})
 await Promise.all([first,second,terminal,writer.flush()])
 assert.deepEqual(seen,[1,2,3])
 assert.deepEqual(writer.snapshot.result,{answer:42})
 assert.equal(writer.snapshot.status,'completed')
})
