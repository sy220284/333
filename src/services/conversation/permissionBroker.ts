import { randomUUID } from 'node:crypto'
import type { CanUseTool, SDKPermissionContext } from '../../entrypoints/sdk/runtimeTypes.js'
import type { PermissionResult } from '../../entrypoints/sdk/coreTypes.js'

export type PendingSdkPermission = Readonly<{
  id: string
  toolName: string
  input: Record<string, unknown>
} & Omit<SDKPermissionContext, 'signal'>>

/** A headless permission mailbox for an SDK session. There is no implicit
 * approval: each tool request waits for a matching user decision or abort. */
export function createSdkPermissionBroker() {
  let nextId = 0
  const instanceId = randomUUID()
  let closed = false
  const pending = new Map<string, {
    request: PendingSdkPermission
    settle: (decision: PermissionResult) => void
  }>()
  const listeners = new Set<() => void>()
  const notify = () => { for (const listener of listeners) listener() }
  const getPending = (): PendingSdkPermission[] => [...pending.values()].map(item => item.request)
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const canUseTool: CanUseTool = (toolName, input, options) => {
    if (closed || options.signal.aborted) {
      return Promise.resolve({ behavior: 'deny', message: 'Tool permission request cancelled' })
    }
    const id = `${instanceId}:${++nextId}`
    const request: PendingSdkPermission = {
      id, toolName, input,
      suggestions: options.suggestions, toolUseID: options.toolUseID,
      requestId: options.requestId, blockedPath: options.blockedPath,
      mcpServer: options.mcpServer, decisionReason: options.decisionReason,
      decisionReasonType: options.decisionReasonType,
      decisionReasonCode: options.decisionReasonCode,
      serverPolicyAskOnly: options.serverPolicyAskOnly,
      title: options.title, displayName: options.displayName,
      description: options.description, defaultToNo: options.defaultToNo,
      suppressAlwaysAllowRule: options.suppressAlwaysAllowRule,
      agentID: options.agentID, plugin: options.plugin,
      requiresUserInteraction: options.requiresUserInteraction,
      serverPrompt: options.serverPrompt,
      computerFolder: options.computerFolder, matchedAskRule: options.matchedAskRule,
    }
    return new Promise<PermissionResult>(resolve => {
      const onAbort = () => settle(id, { behavior: 'deny', message: 'Tool permission request cancelled' })
      const settleOnce = (decision: PermissionResult) => {
        options.signal.removeEventListener('abort', onAbort)
        resolve(decision)
      }
      pending.set(id, { request, settle: settleOnce })
      options.signal.addEventListener('abort', onAbort, { once: true })
      notify()
      if (options.signal.aborted) onAbort()
    })
  }
  const settle = (id: string, decision: PermissionResult): boolean => {
    const item = pending.get(id)
    if (!item) return false
    pending.delete(id)
    item.settle(decision)
    notify()
    return true
  }
  const cancelPending = (reason: string): void => {
    for (const id of [...pending.keys()]) {
      settle(id, { behavior: 'deny', message: reason })
    }
  }
  const close = (): void => {
    if (closed) return
    closed = true
    for (const id of [...pending.keys()]) {
      settle(id, { behavior: 'deny', message: 'Tool permission broker closed' })
    }
  }
  return { canUseTool, getPending, subscribe, settle, cancelPending, close }
}
