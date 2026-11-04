import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executePluginEvalSuite317 } from '../src/cli/handlers/pluginEvalEngine317.mjs'
import { resolveEvalContext317 } from '../src/cli/handlers/pluginEvalWorkspace317.ts'

async function fixture(action) {
  const root = await mkdtemp(join(tmpdir(), 'eval-context-317-'))
  try { await action(root) }
  finally { await rm(root,{recursive:true,force:true}) }
}
function one(dir, context = {}) {
  return {
    name:'case', dir, runs:1, context,
    execution:{prompt:'hello',max_turns:1,timeout_seconds:30},
    graders:[{name:'answer',type:'regex',pattern:'done',weight:1}],
  }
}
test('317 context: original add_dirs and history_file reach actual model args, baseline arm is omitted', () => fixture(async root => {
  await mkdir(join(root,'fixtures'))
  await writeFile(join(root,'history.jsonl'),'{}\n')
  const received=[]
  const result=await executePluginEvalSuite317(
    [one(root,{add_dirs:['fixtures'],history_file:'history.jsonl'})],
    {pluginRoot:root,sourcePluginRoot:root},
    {runModel:async input=>{received.push(input);return {lastMessage:'done',trace:[],costUsd:0}}}
  )
  assert.equal(received.length,1)
  assert.deepEqual(received[0].addDirs,[join(root,'fixtures')])
  assert.equal(received[0].historyFile,join(root,'history.jsonl'))
  assert.equal(result.cases[0].runs.length,1)
  assert.equal(result.score,1)
}))
test('317 scaffold: opt-in runs real bash once per arm, default leaves workspace unchanged', () => fixture(async root => {
  await writeFile(join(root,'setup.sh'),'printf ready > staged.txt\n')
  let runs=0
  const opts={pluginRoot:root,sourcePluginRoot:root,ablation:'none'}
  await executePluginEvalSuite317(
    [one(root,{scaffold_script:'setup.sh'})], opts,
    {runModel:async config=>{runs++;let exists;try{exists=await readFile(join(config.workspace,'staged.txt'),'utf8')}catch(error){if(error.code!=='ENOENT')throw error}
      assert.equal(exists,undefined)
      return {lastMessage:'done',trace:[],costUsd:0}}})
  assert.equal(runs,1)
  const result=await executePluginEvalSuite317(
    [one(root,{scaffold_script:'setup.sh'})], {...opts,scaffold:true},
    {runModel:async config=>{runs++;assert.equal(await readFile(join(config.workspace,'staged.txt'),'utf8'),'ready')
      return {lastMessage:'done',trace:[],costUsd:0}}})
  assert.equal(runs,2)
  assert.equal(result.score,1)
}))
test('317 scaffold: nonzero script exit fails its arm and never runs model', () => fixture(async root => {
  await writeFile(join(root,'fail.sh'),'echo break >&2\nexit 7\n')
  let invoked=0
  const result=await executePluginEvalSuite317(
    [one(root,{scaffold_script:'fail.sh'})],
    {pluginRoot:root,sourcePluginRoot:root,scaffold:true,ablation:'none'},
    {runModel:async()=>{invoked++;return {lastMessage:'done'}}},
  )
  assert.equal(invoked,0)
  assert.equal(result.cases[0].runs[0].score,0)
  assert.match(result.cases[0].runs[0].error,/scaffold failed \(exit 7\)/)
}))
test('317 context: symlink escaping trusted plugin is rejected before model runs', () => fixture(async root => {
  const outside=await mkdtemp(join(tmpdir(),'eval-outside-'))
  try {
    await mkdir(join(outside,'fixtures'))
    await symlink(join(outside,'fixtures'),join(root,'link'),'dir')
    await assert.rejects(resolveEvalContext317(one(root,{add_dirs:['link']}),root),/escaped/)
  } finally { await rm(outside,{recursive:true,force:true}) }
}))
test('317 context: relative parent segments within trusted plugin may target fixtures', () => fixture(async root => {
  await mkdir(join(root,'evals'))
  await mkdir(join(root,'fixtures'))
  const paths=await resolveEvalContext317(one(join(root,'evals'),{add_dirs:['../fixtures']}),root)
  assert.deepEqual(paths.addDirs,[join(root,'fixtures')])
}))
