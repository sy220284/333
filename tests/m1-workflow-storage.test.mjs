import {test} from 'node:test'
import assert from 'node:assert/strict'
import {workflowPaths,workflowRunDirectory,workflowSessionScripts,workflowSummaryPath} from '../src/tasks/LocalWorkflowTask/workflowStoragePaths.mjs'
const project='/data/.claude/projects/-workspace'
const session='9196f277-9e3d-428d-a3ac-88be3ec3bf92'
const run='wf_63ba316d-0b2'
test('x64 workflow journal and script persist under current project and session',()=>{
 const paths=workflowPaths(project,session,run,'probe-return')
 assert.equal(paths.transcriptDir,`${project}/${session}/subagents/workflows/${run}`)
 assert.equal(paths.journal,`${paths.transcriptDir}/journal.jsonl`)
 assert.equal(paths.summaryPath,`${project}/${session}/workflows/${run}.json`)
 assert.equal(workflowSummaryPath(project,session,run),paths.summaryPath)
 assert.equal(paths.scriptPath,`${project}/${session}/workflows/scripts/probe-return-${run}.js`)
 assert.equal(workflowRunDirectory(project,session,run),paths.transcriptDir)
 assert.equal(workflowSessionScripts(project,session),`${project}/${session}/workflows/scripts`)
})
test('workflow run and name cannot traverse into another session',()=>{
 assert.throws(()=>workflowPaths(project,session,'wf_../../outside','probe'),/Invalid workflow/)
 assert.throws(()=>workflowPaths(project,session,run,'../../outside'),/Invalid workflow name/)
})

test('official Workflow summary is atomically written and contains final JSON data',async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises')
 const {tmpdir}=await import('node:os')
 const {join}=await import('node:path')
 const {writeWorkflowSummary,readWorkflowSummary}=await import('../src/tasks/LocalWorkflowTask/workflowSummaryStore.mjs')
 const dir=await mkdtemp(join(tmpdir(),'m1-workflow-summary-'))
 try{
  const path=workflowSummaryPath(dir,session,run)
  const record={runId:run,scriptPath:'/tmp/workflow.js',workflowName:'test',status:'completed',result:{answer:42},workflowProgress:[{type:'workflow_phase',index:1,title:'Run'}]}
  await writeWorkflowSummary(path,record)
  assert.deepEqual(await readWorkflowSummary(path),record)
  const parent=await readFile(path,'utf8')
  assert.match(parent,/"status":"completed"/)
  const {readdir}=await import('node:fs/promises')
  assert.deepEqual((await readdir(join(dir,session,'workflows'))).sort(),[`${run}.json`])
 }finally{await rm(dir,{recursive:true,force:true})}
})

test('resuming with an edited script persists the exact next script atomically',async()=>{
 const {mkdtemp,rm,mkdir,writeFile,readFile,readdir}=await import('node:fs/promises')
 const {join}=await import('node:path')
 const {tmpdir}=await import('node:os')
 const {syncWorkflowScript}=await import('../src/tasks/LocalWorkflowTask/workflowSummaryStore.mjs')
 const dir=await mkdtemp(join(tmpdir(),'m1-workflow-edit-'))
 try{
  const file=join(dir,'edited.js')
  await writeFile(file,'return 1',{mode:0o600})
  assert.equal(await syncWorkflowScript(file,'return 2'),true)
  assert.equal(await readFile(file,'utf8'),'return 2')
  assert.equal(await syncWorkflowScript(file,'return 2'),false)
  assert.deepEqual(await readdir(dir),['edited.js'])
 }finally{await rm(dir,{recursive:true,force:true})}
})
