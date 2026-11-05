import assert from 'node:assert/strict'
import { test } from 'node:test'
import { releaseAgentResources } from '../src/tools/AgentTool/agentCleanup317.mjs'

test('2.1.317 agent cleanup: normal exit releases all resources in order', async () => {
  const released = []
  await releaseAgentResources([
    ['MCP', async () => { released.push('MCP') }],
    ['Hooks', () => { released.push('Hooks') }],
    ['background tasks', () => { released.push('background tasks') }],
  ])
  assert.deepEqual(released, ['MCP', 'Hooks', 'background tasks'])
})

test('2.1.317 agent cleanup: a failed MCP disposer cannot strand downstream resources', async () => {
  const released = []
  const failure = new Error('MCP transport rejected disconnect')
  await assert.rejects(
    releaseAgentResources([
      ['MCP', async () => { released.push('MCP'); throw failure }],
      ['Hooks', () => { released.push('Hooks') }],
      ['background tasks', async () => { released.push('background tasks') }],
    ]),
    error => {
      assert.ok(error instanceof AggregateError)
      assert.equal(error.errors.length, 1)
      assert.match(error.errors[0].message, /MCP/)
      assert.equal(error.errors[0].cause, failure)
      return true
    },
  )
  assert.deepEqual(released, ['MCP', 'Hooks', 'background tasks'])
})

test('2.1.317 agent cleanup: concurrent disposer failures are all reported', async () => {
  const expected = [new Error('one'), new Error('two')]
  await assert.rejects(
    releaseAgentResources([
      ['MCP', () => { throw expected[0] }],
      ['Hooks', () => { throw expected[1] }],
    ]),
    error => {
      assert.ok(error instanceof AggregateError)
      assert.equal(error.errors.length, 2)
      assert.deepEqual(error.errors.map(x => x.cause), expected)
      return true
    },
  )
})

test('2.1.317 agent preserves original model failure when cleanup also rejects', async () => {
  const original = new Error('original model stream error')
  const cleanup = new Error('MCP cleanup rejected')
  const released = []
  await assert.rejects(
    releaseAgentResources([
      ['MCP', () => { throw cleanup }],
      ['todos', () => { released.push('todos') }],
      ['background shells', () => { released.push('background shells') }],
    ], original),
    error => {
      assert.ok(error instanceof AggregateError)
      assert.equal(error.errors.length, 2)
      assert.equal(error.errors[0], original)
      assert.equal(error.errors[1].cause, cleanup)
      assert.equal(error.cause, original)
      return true
    },
  )
  assert.deepEqual(released, ['todos', 'background shells'])
})
