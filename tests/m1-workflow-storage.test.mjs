import {test} from 'node:test'
import assert from 'node:assert/strict'
import {workflowPaths,workflowRunDirectory,workflowSessionScripts} from '../src/tasks/LocalWorkflowTask/workflowStoragePaths.mjs'
const project='/data/.claude/projects/-workspace'
const session='9196f277-9e3d-428d-a3ac-88be3ec3bf92'
const run='wf_63ba316d-0b2'
test('x64 workflow journal and script persist under current project and session',()=>{
 const paths=workflowPaths(project,session,run,'probe-return')
 assert.equal(paths.transcriptDir,`${project}/${session}/subagents/workflows/${run}`)
 assert.equal(paths.journal,`${paths.transcriptDir}/journal.jsonl`)
 assert.equal(paths.scriptPath,`${project}/${session}/workflows/scripts/probe-return-${run}.js`)
 assert.equal(workflowRunDirectory(project,session,run),paths.transcriptDir)
 assert.equal(workflowSessionScripts(project,session),`${project}/${session}/workflows/scripts`)
})
test('workflow run and name cannot traverse into another session',()=>{
 assert.throws(()=>workflowPaths(project,session,'wf_../../outside','probe'),/Invalid workflow/)
 assert.throws(()=>workflowPaths(project,session,run,'../../outside'),/Invalid workflow name/)
})
