import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {listWorkflowFiles} from '../src/tools/WorkflowTool/workflowCommandIndex.mjs'
test('saved workflows are parsed as static metadata and discovered for slash entry',async()=>{
 const root=await mkdtemp(join(tmpdir(),'m1-workflow-commands-'))
 try{
  const folder=join(root,'.claude','workflows')
  await mkdir(folder,{recursive:true})
  await writeFile(join(folder,'safe.mjs'),"export const meta={name:'safe-review',description:'Inspect files'}\nreturn 1")
  const entries=await listWorkflowFiles(root)
  assert.deepEqual(entries.map(x=>x.name),['safe-review'])
  assert.equal(entries[0].file,join(folder,'safe.mjs'))
 }finally{await rm(root,{force:true,recursive:true})}
})
test('malformed workflow is reported and cannot break valid saved workflows',async()=>{
 const root=await mkdtemp(join(tmpdir(),'m1-workflow-command-errors-'))
 try{
  const folder=join(root,'.claude','workflows')
  await mkdir(folder,{recursive:true})
  await writeFile(join(folder,'bad.js'),"export const meta={name:this.constructor.constructor('return process')(),description:'bad'}")
  await writeFile(join(folder,'good.js'),"export const meta={name:'good',description:'safe'}")
  const errors=[]
  const entries=await listWorkflowFiles(root,{onError:problem=>errors.push(problem)})
  assert.deepEqual(entries.map(x=>x.name),['good'])
  assert.equal(errors.length,1)
  assert.match(String(errors[0].error),/static literal/)
 }finally{await rm(root,{force:true,recursive:true})}
})

test('Workflow name resolves by declared meta.name, including .js files and mismatched basename',async()=>{
 const root=await mkdtemp(join(tmpdir(),'m1-workflow-names-'))
 try{
  const folder=join(root,'.claude','workflows')
  await mkdir(folder,{recursive:true})
  await writeFile(join(folder,'draft.js'),"export const meta={name:'published',description:'review'}")
  const {resolveNamedWorkflowFile}=await import('../src/tools/WorkflowTool/workflowCommandIndex.mjs')
  assert.equal(await resolveNamedWorkflowFile(root,'published'),join(folder,'draft.js'))
  await assert.rejects(()=>resolveNamedWorkflowFile(root,'draft'),/was not found/)
 }finally{await rm(root,{force:true,recursive:true})}
})
test('Workflow duplicate meta names fail closed instead of executing an arbitrary script',async()=>{
 const root=await mkdtemp(join(tmpdir(),'m1-workflow-duplicates-'))
 try{
  const folder=join(root,'.claude','workflows')
  await mkdir(folder,{recursive:true})
  await writeFile(join(folder,'one.js'),"export const meta={name:'duplicate',description:'a'}")
  await writeFile(join(folder,'two.mjs'),"export const meta={name:'duplicate',description:'b'}")
  const {resolveNamedWorkflowFile}=await import('../src/tools/WorkflowTool/workflowCommandIndex.mjs')
  await assert.rejects(()=>resolveNamedWorkflowFile(root,'duplicate'),/ambiguous/)
 }finally{await rm(root,{force:true,recursive:true})}
})

test('named workflow resolution accepts the same identifier characters as metadata validation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'m1-workflow-names-digits-'))
 try{
  const folder=join(root,'.claude','workflows')
  await mkdir(folder,{recursive:true})
  await writeFile(join(folder,'file.js'),"export const meta={name:'2026_audit',description:'audit'}")
  const {resolveNamedWorkflowFile}=await import('../src/tools/WorkflowTool/workflowCommandIndex.mjs')
  assert.equal(await resolveNamedWorkflowFile(root,'2026_audit'),join(folder,'file.js'))
 }finally{await rm(root,{force:true,recursive:true})}
})
