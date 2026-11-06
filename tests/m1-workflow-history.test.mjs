import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {writeWorkflowSummary} from '../src/tasks/LocalWorkflowTask/workflowSummaryStore.mjs'
import {workflowSummaryPath} from '../src/tasks/LocalWorkflowTask/workflowStoragePaths.mjs'
import {readWorkflowHistory} from '../src/tasks/LocalWorkflowTask/workflowHistory.mjs'
test('Workflow history lists terminal results in descending order and preserves return data',async()=>{
 const project=await mkdtemp(join(tmpdir(),'m1-workflow-history-')),session='session-test'
 try{
  const records=[
   {runId:'wf_aaaaaaaa-aaa',sessionId:session,scriptPath:'/tmp/a.js',status:'completed',startTime:1,result:{answer:1}},
   {runId:'wf_bbbbbbbb-bbb',sessionId:session,scriptPath:'/tmp/b.js',status:'failed',startTime:2,error:'failure'},
  ]
  for(const record of records)await writeWorkflowSummary(workflowSummaryPath(project,session,record.runId),record)
  const {runs,errors}=await readWorkflowHistory(project,session)
  assert.deepEqual(runs.map(x=>x.runId),['wf_bbbbbbbb-bbb','wf_aaaaaaaa-aaa'])
  assert.deepEqual(runs[1].result,{answer:1})
  assert.deepEqual(errors,[])
 }finally{await rm(project,{recursive:true,force:true})}
})
test('Workflow history identifies corrupt and foreign-session summaries without hiding valid runs',async()=>{
 const project=await mkdtemp(join(tmpdir(),'m1-workflow-foreign-')),session='session-test'
 try{
  const dir=join(project,session,'workflows')
  await mkdir(dir,{recursive:true})
  await writeFile(join(dir,'wf_aaaaaaaa-aaa.json'),'{invalid')
  await writeWorkflowSummary(workflowSummaryPath(project,session,'wf_bbbbbbbb-bbb'),{
   runId:'wf_bbbbbbbb-bbb',sessionId:'foreign',scriptPath:'/tmp/foreign.js'})
  await writeWorkflowSummary(workflowSummaryPath(project,session,'wf_cccccccc-ccc'),{
   runId:'wf_cccccccc-ccc',sessionId:session,scriptPath:'/tmp/good.js',status:'completed'})
  const {runs,errors}=await readWorkflowHistory(project,session)
  assert.deepEqual(runs.map(x=>x.runId),['wf_cccccccc-ccc'])
  assert.equal(errors.length,2)
 }finally{await rm(project,{recursive:true,force:true})}
})

test('工作流中心按项目展示跨会话历史，并隔离其他项目', async () => {
 const {readProjectWorkflowHistory} = await import('../src/tasks/LocalWorkflowTask/workflowHistory.mjs')
 const project=await mkdtemp(join(tmpdir(),'m1-workflow-project-'))
 const other=await mkdtemp(join(tmpdir(),'m1-workflow-other-'))
 try {
  await writeWorkflowSummary(workflowSummaryPath(project,'first','wf_11111111-111'),{
   runId:'wf_11111111-111',sessionId:'first',scriptPath:'/tmp/a.js',startTime:1,status:'completed'})
  await writeWorkflowSummary(workflowSummaryPath(project,'second','wf_22222222-222'),{
   runId:'wf_22222222-222',sessionId:'second',scriptPath:'/tmp/b.js',startTime:4,status:'failed'})
  await writeWorkflowSummary(workflowSummaryPath(other,'third','wf_33333333-333'),{
   runId:'wf_33333333-333',sessionId:'third',scriptPath:'/tmp/c.js',startTime:5,status:'completed'})
  const overview=await readProjectWorkflowHistory(project)
  assert.deepEqual(overview.runs.map(run=>run.runId),['wf_22222222-222','wf_11111111-111'])
  assert.deepEqual(overview.errors,[])
 } finally {
  await rm(project,{recursive:true,force:true})
  await rm(other,{recursive:true,force:true})
 }
})
