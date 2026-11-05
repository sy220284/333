import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { resolvePromptSnapshot, promptSnapshotMode } from '../src/services/cli/systemPromptSnapshot.mjs'
const sid = '0db6914d-3b62-418f-8984-2b06c625e8c6'
test('persist one prompt across turns and resume; regenerate only after compaction',()=>{
  const home=mkdtempSync(join(tmpdir(),'333-prompt-snapshot-'))
  try {
    const opts={home,cwd:'/project/a',sessionId:sid,compactRevision:'0',mode:'on'}
    assert.deepEqual(resolvePromptSnapshot({...opts,prompt:['first']}),['first'])
    assert.deepEqual(resolvePromptSnapshot({...opts,prompt:['second']}),['first'])
    assert.deepEqual(resolvePromptSnapshot({...opts,compactRevision:'compacted-1',prompt:['third']}),['third'])
    assert.deepEqual(resolvePromptSnapshot({...opts,compactRevision:'compacted-1',prompt:['fourth']}),['third'])
    assert.deepEqual(resolvePromptSnapshot({...opts,mode:'off',prompt:['fresh']}),['fresh'])
    assert.deepEqual(resolvePromptSnapshot({...opts,cwd:'/project/b',prompt:['other-project']}),['other-project'])
  } finally {rmSync(home,{recursive:true,force:true})}
})
test('snapshot flag honors --bare default except cloud/background',()=>{
 assert.equal(promptSnapshotMode(undefined,true),'off')
 assert.equal(promptSnapshotMode(undefined,true,true),'on')
 assert.equal(promptSnapshotMode(undefined,false),'on')
 assert.equal(promptSnapshotMode('off',false),'off')
 assert.throws(()=>promptSnapshotMode('yes',false))
})
