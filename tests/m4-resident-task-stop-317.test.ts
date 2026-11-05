import assert from 'node:assert/strict'
import test from 'node:test'
import { stopTask } from '../src/tasks/stopTask.ts'
import { descendantTasks, isStoppableTask } from '../src/tasks/agentLifecycle317.ts'
import type { AppState } from '../src/state/AppState.tsx'

test('stopping a completed agent releases its resident resources and skips exempt branches', async () => {
  const kills: string[] = []
  const root = { id: 'root', agentId: 'root', type: 'local_agent', status: 'completed', description: 'root', pendingMessages: [] }
  const child = { ...root, id: 'child', agentId: 'child', parentAgentId: 'root', status: 'running' }
  const exempt = { ...child, id: 'exempt', agentId: 'exempt', cascadeStopExempt: true }
  const shell = { id: 'shell', agentId: 'child', type: 'local_bash', status: 'running', notified: false,
    shellCommand: { kill() { kills.push('shell') }, cleanup() {} } }
  let state = { tasks: { root, child, exempt, shell }, agentNameRegistry: new Map() } as unknown as AppState
  assert.equal(isStoppableTask(state.tasks.root!, state.tasks), true)
  assert.deepEqual(descendantTasks('root', state.tasks).map(task => task.id), ['shell', 'child'])
  await stopTask('root', { getAppState: () => state, setAppState: update => { state = update(state) } })
  assert.deepEqual(kills, ['shell'])
  assert.equal(state.tasks.root!.status, 'killed')
  assert.equal(state.tasks.child!.status, 'killed')
  assert.equal(state.tasks.exempt!.status, 'running')
})
