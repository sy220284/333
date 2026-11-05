import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectImplementedReleaseTests } from '../build/m1-run-target-tests.mjs'

test('source-implemented changes discover their associated executable tests', () => {
  const fixture = {entries: [
    {id:'2.1.316#004', implementation_status:'源码已修改', changed_files:['src/agent.ts']},
    {id:'2.1.317#065', implementation_status:'源码已修改', changed_files:['src/agent.ts', 'tests/agent.test.mjs']},
    {id:'2.1.317#002', implementation_status:'待源码及运行对照', changed_files:[]},
  ]}
  assert.deepEqual(collectImplementedReleaseTests(fixture, () => true), ['tests/agent.test.mjs'])
})
test('source marked complete without linked runnable tests is rejected', () => {
  assert.throws(() => collectImplementedReleaseTests({entries:[
    {id:'2.1.317#099', implementation_status:'源码已修改', changed_files:['src/orphan.ts']},
  ]}, () => true), /without any related executable test/)
})
test('stale or missing test paths cannot silently satisfy evidence', () => {
  assert.throws(() => collectImplementedReleaseTests({entries:[
    {id:'2.1.317#001', implementation_status:'源码已修改', changed_files:['src/a.ts','tests/a.test.mjs']},
  ]}, () => false), /missing executable test/)
})
