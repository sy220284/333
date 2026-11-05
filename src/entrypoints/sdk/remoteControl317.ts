/**
 * SDK daemon-side Remote Control adapter using the production v2 bridge.
 *
 * The daemon owns this handle. Its agent child processes can restart without
 * tearing down the parent connection; no second WebSocket protocol exists.
 */
import type { SDKControlRequest, SDKControlResponse } from './controlTypes.js'
import type { SDKMessage } from './coreTypes.js'
import type {
  ConnectRemoteControlOptions, InboundPrompt, RemoteControlHandle,
} from '../agentSdkTypes.js'
import type { EnvLessBridgeParams } from '../../bridge/remoteBridgeCore.js'
import type { ReplBridgeHandle, BridgeState } from '../../bridge/replBridge.js'
import { getRemoteSessionUrl } from '../../constants/product.js'
import { initEnvLessBridgeCore } from '../../bridge/remoteBridgeCore.js'

const MAX_QUEUE = 2048
function createQueue<T>() {
  const pending: T[] = []
  let wake: (() => void) | null = null
  let closed = false
  let overflow: Error | undefined
  const notify = () => { const resolve = wake; wake = null; resolve?.() }
  return {
    push(value: T) {
      if (closed) return
      if (pending.length >= MAX_QUEUE) {
        overflow = new Error('Remote Control input queue exceeded capacity')
        closed = true
        notify()
        return
      }
      pending.push(value)
      notify()
    },
    close() {
      closed = true
      notify()
    },
    async *events(): AsyncGenerator<T> {
      for (;;) {
        if (overflow) throw overflow
        const event = pending.shift()
        if (event !== undefined) { yield event; continue }
        if (closed) return
        await new Promise<void>(resolve => { wake = resolve })
      }
    },
  }
}

function requireFrame<T extends 'control_request' | 'control_response'>(
  value: unknown, kind: T,
): T extends 'control_request' ? SDKControlRequest : SDKControlResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (value as {type?: unknown}).type !== kind ||
      typeof (value as {request_id?: unknown}).request_id !== 'string') {
    throw new TypeError('Invalid Remote Control ' + kind + ' frame')
  }
  return value as T extends 'control_request' ? SDKControlRequest : SDKControlResponse
}

/**
 * Optional factory injection is for in-memory transport tests. Production
 * always uses initEnvLessBridgeCore and its built-in authentication, refresh,
 * deduplication, reconnection, tracing and cleanup.
 */
export async function connectSdkRemoteControl317(
  opts: ConnectRemoteControlOptions,
  createBridge: (params: EnvLessBridgeParams) => Promise<ReplBridgeHandle | null> = initEnvLessBridgeCore,
): Promise<RemoteControlHandle | null> {
  if (!opts.getAccessToken()) return null
  const prompts = createQueue<InboundPrompt>()
  const controls = createQueue<unknown>()
  const permissions = createQueue<unknown>()
  const listeners = new Set<(state: BridgeState, detail?: string) => void>()
  let state: BridgeState = 'ready'
  let detail: string | undefined
  let closed = false
  const updateState = (next: BridgeState, reason?: string) => {
    state = next
    detail = reason
    for (const listener of listeners) listener(next, reason)
    if (next === 'failed') {
      prompts.close()
      controls.close()
      permissions.close()
    }
  }
  let bridge: ReplBridgeHandle | null
  try {
    bridge = await createBridge({
      baseUrl: opts.baseUrl,
      orgUUID: opts.orgUUID,
      title: opts.name ?? 'Claude SDK',
      getAccessToken: opts.getAccessToken,
      initialHistoryCap: 0,
      toSDKMessages: () => {
        throw new Error('Daemon bridge only emits SDK messages via writeSdkMessages')
      },
      tags: opts.workerType ? [opts.workerType] : [],
      onStateChange: updateState,
      onInboundMessage: (msg: SDKMessage) => {
        if (msg.type === 'user') {
          prompts.push({ content: msg.message.content, ...(msg.uuid && { uuid: msg.uuid }) })
        }
      },
      onPermissionResponse: response => permissions.push(response),
      onInterrupt: () => controls.push({ type: 'interrupt' }),
      onSetModel: model => controls.push({ type: 'set_model', model }),
      onSetMaxThinkingTokens: maxThinkingTokens =>
        controls.push({ type: 'set_max_thinking_tokens', maxThinkingTokens }),
      onSetPermissionMode: mode => {
        controls.push({ type: 'set_permission_mode', mode })
        return { ok: true }
      },
    })
  } catch (error) {
    prompts.close()
    controls.close()
    permissions.close()
    throw error
  }
  if (!bridge) {
    prompts.close()
    controls.close()
    permissions.close()
    return null
  }

  const active = bridge
  return {
    bridgeSessionId: active.bridgeSessionId,
    environmentId: active.environmentId,
    sessionUrl: getRemoteSessionUrl(active.bridgeSessionId, active.sessionIngressUrl),
    write(message) {
      if (closed) throw new Error('Remote Control connection is closed')
      active.writeSdkMessages([message])
    },
    sendResult() {
      if (closed) throw new Error('Remote Control connection is closed')
      active.sendResult()
    },
    sendControlRequest(request) {
      if (closed) throw new Error('Remote Control connection is closed')
      active.sendControlRequest(requireFrame(request, 'control_request'))
    },
    sendControlResponse(response) {
      if (closed) throw new Error('Remote Control connection is closed')
      active.sendControlResponse(requireFrame(response, 'control_response'))
    },
    sendControlCancelRequest(id) {
      if (closed) throw new Error('Remote Control connection is closed')
      if (!id.trim()) throw new TypeError('Remote Control request ID is required')
      active.sendControlCancelRequest(id)
    },
    inboundPrompts: () => prompts.events(),
    controlRequests: () => controls.events(),
    permissionResponses: () => permissions.events(),
    onStateChange(callback) {
      if (closed) { callback('failed', 'Connection closed'); return }
      listeners.add(callback)
      callback(state, detail)
    },
    async teardown() {
      if (closed) return
      closed = true
      prompts.close()
      controls.close()
      permissions.close()
      listeners.clear()
      await active.teardown()
    },
  }
}
