import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rm } from 'node:fs/promises'
import { executePluginEvalSuite317 } from '../src/cli/handlers/pluginEvalEngine317.mjs'

test('317 eval: Windows EBUSY cleanup yields visible security notice and preserves graded run', async () => {
  const warnings=[]
  let cleans=0, invocations=0
  const fakeModel=async () => {
    invocations++
    return {lastMessage:'PASS',trace:[],costUsd:0}
  }
  const report=await executePluginEvalSuite317([{
    name:'cleanup',dir:process.cwd(),runs:1,
    execution:{prompt:'Say PASS',timeout_seconds:30,max_turns:1},
    graders:[],
  }],{
    ablation:'none',runs:1,keepTemp:false,
    onNotice: message => warnings.push(message),
  },{
    runModel:fakeModel,
    cleanupWorkspace:async (workspace,options) => {
      await rm(workspace,options)
      cleans++
      const error=new Error('resource busy or locked')
      error.code='EBUSY'
      throw error
    },
  })
  assert.equal(invocations,1)
  assert.equal(cleans,1)
  assert.equal(report.cases[0].runs[0].output,'PASS')
  assert.equal(report.cases[0].runs[0].error,undefined)
  assert.equal(warnings.length,1)
  assert.match(warnings[0],/could not remove/)
  assert.match(warnings[0],/do not run git/)
  assert.match(warnings[0],/resource busy/)
})
