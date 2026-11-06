import { test, expect } from 'bun:test'
import { createConversationMessageStore } from '../src/services/conversation/messageStore.js'
import { createConversationTurnRuntime } from '../src/services/conversation/turnRuntime.js'
import { createSdkPermissionBroker } from '../src/services/conversation/permissionBroker.js'

test('headless message store publishes synchronous snapshots and supports unsubscribe', () => {
  const messages = createConversationMessageStore<string>(['first'])
  let notifications = 0
  const stop = messages.subscribe(() => notifications++)
  messages.setMessages(old => [...old, 'second'])
  expect(messages.getSnapshot()).toEqual(['first', 'second'])
  expect(notifications).toBe(1)
  stop()
  messages.setMessages(['reset'])
  expect(messages.getSnapshot()).toEqual(['reset'])
  expect(notifications).toBe(1)
})

test('headless turn executes ordered events and final state without a renderer', async () => {
  async function* execute(value: string) { yield value + ':1'; yield value + ':2'; return 99 }
  const runtime = createConversationTurnRuntime(execute)
  const events: string[] = []
  const result = await runtime.run('task', event => events.push(event))
  expect(events).toEqual(['task:1', 'task:2'])
  expect(result).toBe(99)
  expect(runtime.getSnapshot().phase).toBe('completed')
})

test('headless turn rejects overlap and preserves failure state', async () => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  async function* execute() { await gate; yield 'done' }
  const runtime = createConversationTurnRuntime(execute)
  const running = runtime.run(undefined, () => {})
  await expect(runtime.run(undefined, () => {})).rejects.toThrow('already running')
  release()
  await running
  expect(runtime.getSnapshot().phase).toBe('completed')
})

test('SDK permission broker requires an explicit decision and cleans up', async () => {
  const broker = createSdkPermissionBroker()
  const controller = new AbortController()
  const pending = broker.canUseTool('Bash', { command: 'pwd' }, { signal: controller.signal })
  const [item] = broker.getPending()
  expect(item?.toolName).toBe('Bash')
  expect(broker.settle(item!.id, { behavior: 'allow', updatedInput: { command: 'pwd' } })).toBe(true)
  expect((await pending).behavior).toBe('allow')
  expect(broker.getPending()).toEqual([])
  expect(broker.settle(item!.id, { behavior: 'allow', updatedInput: {} })).toBe(false)
  broker.close()
})

test('SDK permission broker denies pending requests on abort/close', async () => {
  const broker = createSdkPermissionBroker()
  const controller = new AbortController()
  const cancelled = broker.canUseTool('Bash', { command: 'rm' }, { signal: controller.signal })
  controller.abort()
  expect((await cancelled).behavior).toBe('deny')
  const pending = broker.canUseTool('Write', { file_path: '/tmp/a' }, { signal: new AbortController().signal })
  broker.close()
  expect((await pending).behavior).toBe('deny')
  expect(broker.getPending()).toEqual([])
})
