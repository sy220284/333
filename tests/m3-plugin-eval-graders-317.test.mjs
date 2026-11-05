import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { gradeEvalResult317, aggregateEvalScore317 } from '../src/cli/handlers/pluginEvalGraders317.mjs'

async function fixture(callback) {
  const workspace = await mkdtemp(join(tmpdir(), 'eval-317-grader-'))
  try {
    await mkdir(join(workspace, 'nested'))
    await writeFile(join(workspace, 'nested', 'output.txt'), 'Hello world')
    return await callback(workspace)
  } finally { await rm(workspace, { recursive: true, force: true }) }
}

test('317 regex grader: contains, not_contains and exact count', async () => fixture(async workspace => {
  const context = { workspace, lastMessage: 'alpha alpha beta' }
  const grade = (pattern, match) => gradeEvalResult317({
    type: 'regex', name: pattern, pattern, match,
  }, context)
  assert.equal((await grade('alpha', 'contains')).score, 1)
  assert.equal((await grade('alpha', 'count:2')).score, 1)
  assert.equal((await grade('alpha', 'not_contains')).score, 0)
  assert.equal((await grade('gamma', 'not_contains')).score, 1)
}))

test('317 file_exists grader: nested files and absence', async () => fixture(async workspace => {
  const ctx = { workspace }
  assert.equal((await gradeEvalResult317({ type: 'file_exists', name: 'file', path: '**/*.txt' }, ctx)).score, 1)
  assert.equal((await gradeEvalResult317({ type: 'file_exists', name: 'missing', path: 'missing.txt', exists: false }, ctx)).score, 1)
  assert.equal((await gradeEvalResult317({ type: 'file_exists', name: 'wrong', path: 'missing.txt' }, ctx)).score, 0)
}))

test('317 tool_used/order: actual tool_use trace, order and input filtering', async () => fixture(async workspace => {
  const ctx = {
    workspace,
    trace: [{ type: 'assistant', message: { content: [
      { type: 'tool_use', name: 'Read', input: { file_path: 'file.txt' } },
      { type: 'tool_use', name: 'Edit', input: { file_path: 'file.txt' } },
    ] } }],
  }
  assert.equal((await gradeEvalResult317({ type: 'tool_used', name: 'read', tool: 'Read', input_match: 'file.txt' }, ctx)).score, 1)
  assert.equal((await gradeEvalResult317({ type: 'tool_used', name: 'bash', tool: 'Bash' }, ctx)).score, 0)
  assert.equal((await gradeEvalResult317({ type: 'tool_order', name: 'order', before: 'Read', after: 'Edit' }, ctx)).score, 1)
  assert.equal((await gradeEvalResult317({ type: 'tool_order', name: 'reverse', before: 'Edit', after: 'Read' }, ctx)).score, 0)
}))

test('317 llm grader: model result used for score, no judge means failure', async () => fixture(async workspace => {
  const context = { workspace, lastMessage: 'Correct answer' }
  const grader = { type: 'llm', name: 'rubric', criteria: 'Be correct' }
  const result = await gradeEvalResult317(grader, context, async x => {
    assert.equal(x.output, 'Correct answer')
    return { score: 0.75, reason: 'partially correct' }
  })
  assert.equal(result.score, 0.75)
  assert.equal(result.pass, false)
  const failed = await gradeEvalResult317(grader, context)
  assert.equal(failed.score, 0)
  assert.match(failed.error, /real judge/)
}))

test('317 eval weighted aggregation never includes trigger-only grader', () => {
  assert.deepEqual(aggregateEvalScore317([
    { score: 1, weight: 2, pass: true },
    { score: 0, weight: 1, pass: false },
    { score: 1, weight: 1000, pass: true, indicatorOnly: true },
  ]), { score: 2 / 3, weight: 3, passes: 1, failures: 1 })
})
