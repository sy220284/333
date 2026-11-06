import type { SDKHostControlRequest } from '../../entrypoints/sdk/controlTypes.js'
import type { HostControlRequestHandler } from '../../entrypoints/sdk/runtimeTypes.js'

export type PendingHostControl = Readonly<{
  id: string
  request: SDKHostControlRequest
}>

/** One session's trusted host control mailbox. An SDK request is never
 * implicitly answered; closing or interrupting rejects pending requests. */
export function createHostControlBroker() {
  let closed = false
  const pending = new Map<string, {
    item: PendingHostControl
    resolve: (value: Record<string, unknown>) => void
    reject: (error: Error) => void
    signal: AbortSignal
    onAbort: () => void
  }>()
  const listeners = new Set<() => void>()
  const notify = () => { for (const listener of listeners) listener() }
  const getPending = (): PendingHostControl[] => [...pending.values()].map(item => item.item)
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const settle = (id: string, response: Record<string, unknown>): boolean => {
    const entry = pending.get(id)
    if (!entry) return false
    pending.delete(id)
    entry.signal.removeEventListener('abort', entry.onAbort)
    entry.resolve(response)
    notify()
    return true
  }
  const reject = (id: string, reason: string): boolean => {
    const entry = pending.get(id)
    if (!entry) return false
    pending.delete(id)
    entry.signal.removeEventListener('abort', entry.onAbort)
    entry.reject(new Error(reason))
    notify()
    return true
  }
  const onControlRequest: HostControlRequestHandler = (request, { signal, requestId }) => {
    if (closed || signal.aborted) {
      return Promise.reject(new Error('Host control request cancelled'))
    }
    if (pending.has(requestId)) {
      return Promise.reject(new Error('Duplicate host control request ID'))
    }
    return new Promise<Record<string, unknown>>((resolve, rejectRequest) => {
      const onAbort = () => reject(requestId, 'Host control request cancelled')
      pending.set(requestId, {
        item: { id: requestId, request },
        resolve, reject: rejectRequest, signal, onAbort,
      })
      signal.addEventListener('abort', onAbort, { once: true })
      notify()
      if (signal.aborted) onAbort()
    })
  }
  const cancelPending = (reason: string): void => {
    for (const id of [...pending.keys()]) reject(id, reason)
  }
  const close = (): void => {
    if (closed) return
    closed = true
    cancelPending('Host control session closed')
    listeners.clear()
  }
  return { onControlRequest, getPending, subscribe, settle, reject, cancelPending, close }
}
