import { test, expect } from 'bun:test'
import { connectSdkRemoteControl317 } from '../src/entrypoints/sdk/remoteControl317.ts'
import type { SDKMessage } from '../src/entrypoints/sdk/coreTypes.ts'
import type { EnvLessBridgeParams } from '../src/bridge/remoteBridgeCore.ts'
import type { ReplBridgeHandle } from '../src/bridge/replBridge.ts'

const options = {
  dir: '/project',
  baseUrl: 'https://claude.ai',
  orgUUID: 'org-test',
  model: 'claude-opus-5-5',
  getAccessToken: () => 'test-token',
}

test('SDK daemon Remote Control does not open a bridge without OAuth', async () => {
  let created = false
  const handle = await connectSdkRemoteControl317(
    { ...options, getAccessToken: () => undefined },
    async () => { created = true; throw new Error('not reached') },
  )
  expect(handle).toBeNull()
  expect(created).toBe(false)
})

test('SDK daemon Remote Control shares bridge messages, inputs and parent-owned teardown', async () => {
  let received: EnvLessBridgeParams | undefined
  const writes: SDKMessage[][] = []
  let stopped = 0
  let sentResult = 0
  let cancelled: string | undefined
  const factory = async (params: EnvLessBridgeParams): Promise<ReplBridgeHandle> => {
    received = params
    params.onStateChange?.('connected')
    return {
      bridgeSessionId: 'cse_test-session',
      environmentId: '',
      sessionIngressUrl: 'https://claude.ai',
      writeMessages: () => { throw new Error('daemon must write SDK messages') },
      writeSdkMessages: messages => { writes.push(messages) },
      sendControlRequest: () => {},
      sendControlResponse: () => {},
      sendControlCancelRequest: id => { cancelled = id },
      sendResult: () => { sentResult++ },
      teardown: async () => { stopped++ },
    }
  }
  const handle = await connectSdkRemoteControl317(options, factory)
  expect(handle).not.toBeNull()
  if (!handle || !received) throw new Error('Bridge did not initialize')
  expect(handle.bridgeSessionId).toBe('cse_test-session')
  expect(handle.sessionUrl).toContain('/code/session_')
  const states: string[] = []
  handle.onStateChange(state => states.push(state))
  expect(states).toEqual(['connected'])

  const promptEvent = handle.inboundPrompts().next()
  await received.onInboundMessage?.({
    type: 'user', uuid: 'remote-user-1',
    message: { role: 'user', content: 'remote instruction' },
  } as SDKMessage)
  expect((await promptEvent).value).toEqual({ content: 'remote instruction', uuid: 'remote-user-1' })
  const controlEvent = handle.controlRequests().next()
  received.onSetModel?.('claude-opus-5-5')
  expect((await controlEvent).value).toEqual({ type: 'set_model', model: 'claude-opus-5-5' })
  const permissionEvent = handle.permissionResponses().next()
  received.onPermissionResponse?.({
    type: 'control_response', request_id: 'req-test',
    response: { subtype: 'success', request_id: 'req-test', response: { behavior: 'allow' } },
  } as never)
  expect((await permissionEvent).value).toHaveProperty('type', 'control_response')

  handle.write({ type: 'user', message: { role: 'user', content: 'hello' } } as SDKMessage)
  expect(writes).toHaveLength(1)
  handle.sendResult()
  expect(sentResult).toBe(1)
  expect(() => handle.sendControlRequest({ type: 'control_request' })).toThrow('Invalid')
  handle.sendControlCancelRequest('req-test')
  expect(cancelled).toBe('req-test')
  await handle.teardown()
  await handle.teardown()
  expect(stopped).toBe(1)
  expect(() => handle.write({ type: 'user' } as SDKMessage)).toThrow('closed')
}, 15_000)
