import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEvalCase317, pluginEvalInit317 } from '../src/cli/handlers/pluginEvalInit317.ts'

async function fixture(fn, plugin=true) {
  const root=await mkdtemp(join(tmpdir(),'eval-init317-'))
  try {
    if (plugin) {
      await mkdir(join(root,'.claude-plugin'))
      await writeFile(join(root,'.claude-plugin','plugin.json'),'{"name":"test"}')
    }
    await fn(root)
  } finally { await rm(root,{recursive:true,force:true}) }
}
test('317 init: bare case bytes match the official prompt.md and graders/criteria.md',()=>fixture(async dir=>{
  const out=await createEvalCase317('baseline',{cwd:dir})
  assert.equal(out,join(dir,'evals','baseline'))
  const expectedPrompt = '---\nmax_turns: 10\nallowed_tools: [Read, Glob, Grep, Skill]\n---\n\nTODO: describe what the agent should do\n'
  const expectedCriteria = '---\ntype: llm\nweight: 1\n---\n\nTODO: describe what a successful response looks like\n'
  assert.equal(await readFile(join(out,'prompt.md'),'utf8'), expectedPrompt)
  assert.equal(await readFile(join(out,'graders','criteria.md'),'utf8'), expectedCriteria)
  const entries = await import('node:fs/promises').then(fs=>fs.readdir(out))
  assert.deepEqual(entries.sort(), ['graders','prompt.md'])
  await assert.rejects(createEvalCase317('baseline',{cwd:dir}),/already exists/)
}))
test('317 init: nested eval-dir is created safely and names are validated',()=>fixture(async dir=>{
  const out=await createEvalCase317('case_01',{cwd:dir,evalDir:'custom/evals'})
  assert.equal(out,join(dir,'custom','evals','case_01'))
  for(const name of ['../outside','', '.hidden','foo/bar','..']) {
    await assert.rejects(createEvalCase317(name,{cwd:dir}),/name/)
  }
}))
test('317 init: symlink outside the plugin is rejected before file writes',()=>fixture(async dir=>{
  const other=await mkdtemp(join(tmpdir(),'eval-init-out-'))
  try{
    await symlink(other,join(dir,'out'),'dir')
    await assert.rejects(createEvalCase317('bad',{cwd:dir,evalDir:'out/evals'}),/escaped/)
  }finally{await rm(other,{recursive:true,force:true})}
}))
test('317 init: non-TTY requires case name; explicit eval-dir works outside plugin',()=>fixture(async dir=>{
  await assert.rejects(pluginEvalInit317(undefined,{bare:true,cwd:dir}),/case name/)
  const out=await createEvalCase317('case',{cwd:dir,evalDir:'evals'})
  assert.equal(out,join(dir,'evals','case'))
},false))
