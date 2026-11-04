import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEvalCase317 } from '../src/cli/handlers/pluginEvalInit317.ts'
import { readEvalCase317 } from '../src/cli/handlers/pluginEvalCatalog317.ts'
import { parseYaml } from '../src/utils/yaml.js'

async function plugin(testcase) {
  const root = await mkdtemp(join(tmpdir(),'official-eval317-'))
  try {
    await mkdir(join(root,'.claude-plugin'))
    await writeFile(join(root,'.claude-plugin','plugin.json'),'{"name":"eval317"}')
    await testcase(root)
  } finally { await rm(root,{recursive:true,force:true}) }
}
test('canonical YAML source mode correctly parses basic eval content', () => {
  assert.deepEqual(parseYaml('a: [one, two]\n'), {a:['one','two']})
})
test('official blank 317 init template is refused until both prompt and criteria are authored',()=>plugin(async root=>{
  const out=await createEvalCase317('blank',{cwd:root})
  await assert.rejects(readEvalCase317(out),/blank init template/)
  await writeFile(join(out,'prompt.md'),
    '---\nmax_turns: 10\nallowed_tools: [Read, Glob, Grep, Skill]\n---\n\nWrite a clear answer\n')
  await assert.rejects(readEvalCase317(out),/grader.*blank init template/)
  await writeFile(join(out,'graders','criteria.md'),
    '---\ntype: llm\nweight: 1\n---\n\nAnswer must match the requirement.\n')
  const found=await readEvalCase317(out)
  assert.equal(found.execution.prompt,'Write a clear answer')
  assert.equal(found.execution.max_turns,10)
  assert.deepEqual(found.execution.allowed_tools,['Read','Glob','Grep','Skill'])
  assert.equal(found.graders[0].name,'criteria')
  assert.equal(found.graders[0].criteria,'Answer must match the requirement.')
}))
