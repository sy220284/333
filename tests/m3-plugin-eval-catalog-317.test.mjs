import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readEvalCase317, discoverEvalCases317 } from '../src/cli/handlers/pluginEvalCatalog317.mjs'

async function fixture(body) {
  const root = await mkdtemp(join(tmpdir(), 'eval317-catalog-'))
  try { await body(root) }
  finally { await rm(root, { recursive: true, force: true }) }
}

test('317 eval: YAML case and regex grader parsed with official schema', () => fixture(async root => {
  const evalDir = join(root, 'evals')
  const caseDir = join(evalDir, 'basic')
  await mkdir(caseDir, { recursive: true })
  await writeFile(join(caseDir, 'case.yaml'), `
schema_version: "1.1"
name: basic
runs: 2
execution:
  prompt: Say hello
  max_turns: 3
  timeout_seconds: 12
graders:
  - name: greeting
    type: regex
    pattern: hello
    match: contains
`)
  const result = await readEvalCase317(caseDir)
  assert.equal(result.name, 'basic')
  assert.equal(result.runs, 2)
  assert.equal(result.execution.max_turns, 3)
  assert.equal(result.graders[0].pattern, 'hello')
  assert.equal((await discoverEvalCases317(evalDir)).length, 1)
}))

test('317 eval: prompt.md frontmatter and Markdown grader body merge into case', () => fixture(async root => {
  await mkdir(join(root, 'graders'))
  await writeFile(join(root, 'prompt.md'), `---
runs: 1
max_turns: 5
---
Say hello to Alice.`)
  await writeFile(join(root, 'graders', 'greeting.md'), `---
type: regex
---
Alice`)
  const result = await readEvalCase317(root)
  assert.equal(result.runs, 1)
  assert.equal(result.execution.max_turns, 5)
  assert.equal(result.execution.prompt, 'Say hello to Alice.')
  assert.equal(result.graders[0].pattern, 'Alice')
}))

test('317 eval: missing prompt or valid graders is an explicit error', () => fixture(async root => {
  await writeFile(join(root, 'case.yaml'), `
schema_version: "1.1"
name: invalid
execution: {}
graders:
  - name: ok
    type: regex
    pattern: hi`)
  await assert.rejects(readEvalCase317(root), /execution.prompt is required/)
}))

test('317 eval: unsafe symlink entries are not followed', () => fixture(async root => {
  const evalDir = join(root, 'evals'), outside = join(root, 'outside')
  await mkdir(evalDir)
  await mkdir(outside)
  await writeFile(join(outside, 'case.yaml'), `
schema_version: "1.1"
name: outside
execution: {prompt: Outside}
graders: [{name: x, type: regex, pattern: x}]`)
  try { await symlink(outside, join(evalDir, 'link'), 'dir') }
  catch (error) { if (error.code === 'EPERM' || error.code === 'EACCES') return; throw error }
  assert.deepEqual(await discoverEvalCases317(evalDir), [])
}))

test('317 eval: duplicate grader names are rejected before any model call', () => fixture(async root => {
  await writeFile(join(root, 'case.yaml'), `
schema_version: "1.1"
name: bad
execution: {prompt: Try}
graders:
  - {name: same, type: regex, pattern: one}
  - {name: same, type: regex, pattern: two}`)
  await assert.rejects(readEvalCase317(root), /duplicate grader/)
}))
