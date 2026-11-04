import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { executePluginEvalSuite317 } from '../src/cli/handlers/pluginEvalEngine317.mjs'
import { renderPluginEvalReport317 } from '../src/cli/handlers/pluginEvalReport317.mjs'

function sample(dir, grader = { name: 'expected', type: 'regex', pattern: 'hello' }) {
  return { name: 'case-1', dir, runs: 1,
    execution: { prompt: 'Say hello', timeout_seconds: 15, max_turns: 4 },
    graders: [grader] }
}
async function sandbox(fn) {
  const root = await mkdtemp(join(tmpdir(), '317-eval-engine-'))
  try { return await fn(root) }
  finally { await rm(root, { recursive: true, force: true }) }
}

test('317 eval: actual model adapter runs plugin and no-plugin arms, keeps score and ordering', () => sandbox(async dir => {
  const calls = []
  const runModel = async config => {
    calls.push({ ...config })
    return {
      lastMessage: config.pluginDir ? 'hello' : 'goodbye',
      trace: [{ type: 'assistant', message: { content: [{ type: 'text', text: 'answer' }] } }],
      costUsd: 0.12,
    }
  }
  const result = await executePluginEvalSuite317(
    [sample(dir)], { pluginRoot: dir, concurrency: 1 }, { runModel })
  assert.deepEqual(calls.map(c => Boolean(c.pluginDir)), [true, false])
  assert.deepEqual(calls.map(c => c.maxTurns), [4, 4])
  assert.equal(result.cases[0].runs.length, 2)
  assert.deepEqual(result.cases[0].runs.map(x => x.score), [1, 0])
  assert.equal(result.costUsd, 0.24)
  assert.equal(result.score, 0.5)
}))

test('317 eval: failed model response cannot pass a not_contains grader', () => sandbox(async dir => {
  const result = await executePluginEvalSuite317(
    [sample(dir, { name: 'empty', type: 'regex', pattern: 'failure', match: 'not_contains' })],
    { pluginRoot: dir, ablation: 'none' },
    { runModel: async () => ({ lastMessage: '', trace: [], error: 'auth failed', costUsd: 0.01 }) })
  assert.equal(result.score, 0)
  assert.equal(result.cases[0].runs[0].error, 'auth failed')
  assert.equal(result.cases[0].runs[0].verdicts[0].pass, false)
}))

test('317 eval: LLM grader invokes judge and bills model and judge costs', () => sandbox(async dir => {
  let judgeCalled = 0
  const result = await executePluginEvalSuite317(
    [sample(dir, { name: 'semantic', type: 'llm', criteria: 'clear' })],
    { pluginRoot: dir, ablation: 'none' },
    {
      runModel: async () => ({ lastMessage: 'good', trace: [], costUsd: 0.3 }),
      judge: async request => {
        judgeCalled++
        assert.equal(request.output, 'good')
        return { score: 0.8, reason: 'acceptable', costUsd: 0.15 }
      },
    })
  assert.equal(judgeCalled, 1)
  assert.equal(result.cases[0].runs[0].score, 0.8)
  assert.equal(result.costUsd, 0.45)
}))

test('317 eval: baseline grader uses case file but protects path traversal', () => sandbox(async dir => {
  await writeFile(join(dir, 'reference.md'), 'reference answer')
  let actualBaseline
  const result = await executePluginEvalSuite317(
    [sample(dir, { name: 'baseline', type: 'baseline', baseline_file: 'reference.md', criteria: 'compare' })],
    { pluginRoot: dir, ablation: 'none' },
    {
      runModel: async () => ({ lastMessage: 'hello', trace: [], costUsd: 0 }),
      judge: async value => {
        actualBaseline = value.context.baseline
        return { score: 1, reason: 'match' }
      },
    })
  assert.equal(actualBaseline, 'reference answer')
  assert.equal(result.score, 1)
}))

test('317 eval: rendered report HTML safely escapes arbitrary model output', () => {
  const content = renderPluginEvalReport317({
    score: 0, costUsd: 0, cases: [{
      name: '<script>alert(1)</script>', score: 0,
      runs: [{ arm: 'with', repeat: 1, score: 0,
        output: '<img src=x onerror=alert(1)>', error: '<script>bad</script>' }],
    }],
  })
  assert.doesNotMatch(content, /<script>/)
  assert.doesNotMatch(content, /<img src=x/)
  assert.match(content, /&lt;script&gt;/)
  assert.match(content, /&lt;img/)
})
