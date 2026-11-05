import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWorkflowCallCounter, makeWorkflowCacheKey } from '../src/tasks/LocalWorkflowTask/workflowCacheKeys.mjs'
test('same prompt in two separate call positions receives separate cache keys',()=>{
 const next=createWorkflowCallCounter()
 const first=next('inspect file',{model:'a'})
 const second=next('inspect file',{model:'a'})
 assert.notEqual(first,second)
 assert.equal(first,makeWorkflowCacheKey('inspect file',{model:'a'},0))
 assert.equal(second,makeWorkflowCacheKey('inspect file',{model:'a'},1))
})
test('inserting unrelated calls preserves existing cached keys',()=>{
 const old=createWorkflowCallCounter()
 const x=old('one',{})
 const y=old('two',{})
 const revised=createWorkflowCallCounter()
 assert.equal(revised('one',{}),x)
 revised('inserted',{})
 assert.equal(revised('two',{}),y)
})
test('different options have distinct keys; invalid occurrence is rejected',()=>{
 const next=createWorkflowCallCounter()
 assert.notEqual(next('same',{model:'a'}),next('same',{model:'b'}))
 assert.throws(()=>makeWorkflowCacheKey('x',{},-1),/Invalid workflow/)
})
