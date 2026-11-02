import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveCloudTarget, validateCloudEnvironment } from '../src/services/cli/cloudTarget.mjs'
test('cloud description and positional prompt create a session',()=>{
 assert.deepEqual(resolveCloudTarget('review build',undefined),{kind:'create',description:'review build'})
 assert.deepEqual(resolveCloudTarget(true,'review build'),{kind:'create',description:'review build'})
 assert.deepEqual(resolveCloudTarget(true,undefined),{kind:'create',description:''})
})
test('cloud session identifiers and URLs attach only valid authenticated destinations',()=>{
 assert.deepEqual(resolveCloudTarget('session_abcDef123',''),{kind:'attach',sessionId:'session_abcDef123'})
 assert.deepEqual(resolveCloudTarget('https://claude.ai/code/session_abcDef123',''),{kind:'attach',sessionId:'session_abcDef123'})
 for(const bad of ['http://claude.ai/code/session_foo','https://evil.example/code/session_foo','https://claude.ai.evil.example/code/session_foo','https://claude.ai/other/session_foo']){
  assert.throws(()=>resolveCloudTarget(bad),/Cloud session URL|Invalid Claude/)
 }
})
test('self-hosted environment requires a ccpool identifier',()=>{
 assert.equal(validateCloudEnvironment(undefined),undefined)
 assert.equal(validateCloudEnvironment('ccpool_abc-2'),'ccpool_abc-2')
 assert.throws(()=>validateCloudEnvironment('../foo'))
})
