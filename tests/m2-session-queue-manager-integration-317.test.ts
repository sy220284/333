import { test, expect } from 'bun:test'
import { getSessionId, switchSession } from '../src/bootstrap/state.js'
import { asSessionId } from '../src/types/ids.js'
import {
  enqueue, getCommandQueue, getCommandQueueLength, getCommandQueueSnapshot,
  peek, dequeue, remove, resetCommandQueue, subscribeToCommandQueue,
} from '../src/utils/messageQueueManager.js'

test('session queue manager binds command ownership and restores isolated snapshots on /resume', () => {
  const previousSession = getSessionId()
  const first = asSessionId('11111111-1111-4111-8111-111111111111')
  const second = asSessionId('22222222-2222-4222-8222-222222222222')
  let changes = 0
  const unsubscribe = subscribeToCommandQueue(() => { changes++ })
  try {
    switchSession(first)
    resetCommandQueue()
    enqueue({ mode: 'prompt', value: 'session-a', priority: 'now', unlogged: true })
    const firstCommand = getCommandQueue()[0]!
    expect(firstCommand.sessionId).toBe(first)
    const firstSnapshot = getCommandQueueSnapshot()
    expect(firstSnapshot).toHaveLength(1)

    switchSession(second)
    resetCommandQueue()
    expect(getCommandQueueLength()).toBe(0)
    enqueue({ mode: 'prompt', value: 'session-b', priority: 'later', unlogged: true })
    expect(peek()?.value).toBe('session-b')
    expect(getCommandQueueSnapshot()[0]?.sessionId).toBe(second)

    // Async consumer completed a message issued by the original session.
    remove([firstCommand])
    expect(getCommandQueueLength()).toBe(1)
    switchSession(first)
    expect(getCommandQueueLength()).toBe(0)
    expect(getCommandQueueSnapshot()).toHaveLength(0)
    expect(firstSnapshot[0]?.value).toBe('session-a')

    switchSession(second)
    expect(dequeue()?.value).toBe('session-b')
    expect(getCommandQueueLength()).toBe(0)
    expect(changes).toBeGreaterThan(4)
  } finally {
    unsubscribe()
    switchSession(first)
    resetCommandQueue()
    switchSession(second)
    resetCommandQueue()
    switchSession(previousSession)
  }
})
