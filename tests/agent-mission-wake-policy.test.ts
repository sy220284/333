import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateMissionWake } from '../src/proactive/missionWakePolicy.ts'

test('super-agent idle wake stops after repeated turns without a mission checkpoint', () => {
  const mission = { id: 'mission_a', revision: 1 }
  const first = evaluateMissionWake(undefined, mission)
  assert.equal(first.wake, true)
  const second = evaluateMissionWake(first.state, mission)
  assert.equal(second.wake, true)
  const third = evaluateMissionWake(second.state, mission)
  assert.equal(third.wake, false)
})

test('verified progress, a new mission, or a new run resets the wake budget', () => {
  const initial = evaluateMissionWake(undefined, { id: 'mission_a', revision: 1 })
  const second = evaluateMissionWake(initial.state, { id: 'mission_a', revision: 1 })
  assert.equal(evaluateMissionWake(second.state, { id: 'mission_a', revision: 2 }).wake, true)
  assert.equal(evaluateMissionWake(second.state, { id: 'mission_b', revision: 1 }).wake, true)
  assert.equal(evaluateMissionWake(undefined, { id: 'mission_a', revision: 1 }).wake, true)
})

test('wake policy rejects an invalid budget', () => {
  assert.throws(() => evaluateMissionWake(undefined, { id: 'm', revision: 0 }, 0))
})
