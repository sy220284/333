import { test, expect } from 'bun:test'
import { createConversationMessageStore } from '../src/services/conversation/messageStore.js'
import { createConversationAppStateStore } from '../src/services/conversation/appStateStore.js'
import { createHeadlessConversationSession } from '../src/services/conversation/headlessSession.js'
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
  async function* execute(value: string) { yield `${value}:1`; yield `${value}:2`; return 99 }
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
  if (!item) throw new Error('Expected a pending permission request')
  expect(item.toolName).toBe('Bash')
  expect(broker.settle(item.id, { behavior: 'allow', updatedInput: { command: 'pwd' } })).toBe(true)
  expect((await pending).behavior).toBe('allow')
  expect(broker.getPending()).toEqual([])
  expect(broker.settle(item.id, { behavior: 'allow', updatedInput: {} })).toBe(false)
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

test('headless application state emits changes without a React provider', () => {
  type State = Parameters<typeof createConversationAppStateStore>[0]
  const initial = { toolPermissionContext: { mode: 'default' }, mainLoopModel: null } as State
  let changed = 0
  const store = createConversationAppStateStore(initial, () => changed++)
  store.setState(prev => ({ ...prev, mainLoopModel: 'test' }))
  expect(store.getState().mainLoopModel).toBe('test')
  expect(changed).toBe(1)
})

test('headless SDK session streams, synchronizes state and enforces permission decisions', async () => {
  let canUseTool!: (tool: string, input: Record<string, unknown>, options: { signal: AbortSignal }) => Promise<unknown>
  const launch = ((options: { canUseTool: typeof canUseTool }) => {
    canUseTool = options.canUseTool
    return {
      sessionId: 'test-session',
      initialization: Promise.resolve({}),
      send: async (_message: string) => {},
      stream: async function* () {
        yield { type: 'assistant', text: 'ok' }
        yield { type: 'result', subtype: 'success' }
      },
      control: async (_request: unknown) => ({}),
      close: () => {},
      closeAndWait: async () => {},
    }
  }) as unknown as typeof import('../src/entrypoints/sdk/sessionRuntime317.js').createSessionRuntime317
  const session = createHeadlessConversationSession({ model: 'test' }, undefined, launch)
  expect(typeof canUseTool).toBe('function')
  await session.send('hello')
  const events: string[] = []
  for await (const item of session.stream()) events.push(item.type)
  expect(events).toEqual(['assistant', 'result'])
  expect(session.messages.getSnapshot().length).toBe(2)
  expect(session.state.getState().phase).toBe('completed')
  const decision = canUseTool('Bash', {}, { signal: new AbortController().signal })
  const [request] = session.permissions.getPending()
  if (!request) throw new Error('Expected the SDK permission request')
  expect(request.toolName).toBe('Bash')
  session.permissions.settle(request.id, { behavior: 'deny', message: 'User declined' })
  expect((await decision as { behavior: string }).behavior).toBe('deny')
  await session.closeAndWait()
  expect(session.state.getState().phase).toBe('closed')
})

test('consumer errors close the underlying headless turn generator', async () => {
  let finalized = false
  async function* execute() {
    try { yield 'first'; yield 'second' }
    finally { finalized = true }
  }
  const runtime = createConversationTurnRuntime(execute)
  await expect(runtime.run(undefined, () => { throw Error('consumer failed') })).rejects.toThrow('consumer failed')
  expect(finalized).toBe(true)
  expect(runtime.getSnapshot().phase).toBe('failed')
})

test('headless SDK terminal errors publish failed state rather than success', async () => {
  const launch = (() => ({
    sessionId: 'failed-session',
    initialization: Promise.resolve({}),
    send: async () => {},
    stream: async function* () {
      yield { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['model failed'] }
    },
    control: async () => ({}),
    close: () => {},
    closeAndWait: async () => {},
  })) as unknown as typeof import('../src/entrypoints/sdk/sessionRuntime317.js').createSessionRuntime317
  const session = createHeadlessConversationSession({ model: 'test' }, undefined, launch)
  await session.send('test')
  for await (const _event of session.stream()) {}
  expect(session.state.getState()).toEqual({ phase: 'failed', error: 'model failed' })
  session.close()
})
