import { createStore } from '../../state/store.js'

/** Canonical, renderer-neutral message state. Updates are synchronous, so
 * callers can read the latest transcript before any UI render completes. */
export function createConversationMessageStore<T>(initialMessages: T[] = []) {
  const store = createStore<T[]>(initialMessages)
  const getSnapshot = store.getState
  const subscribe = store.subscribe
  const setMessages = (update: T[] | ((prev: T[]) => T[])): void => {
    store.setState(prev => typeof update === 'function'
      ? (update as (prev: T[]) => T[])(prev)
      : update)
  }
  return { getSnapshot, subscribe, setMessages }
}

/** Append-only SDK message history. A stream may contain hundreds of thousands
 * of events; copying the entire transcript on every append is quadratic.
 * Materialize an immutable array only when a consumer requests a snapshot.
 * Existing React-facing createConversationMessageStore keeps its semantics. */
export function createAppendOnlyConversationMessageStore<T>() {
  const chunkSize = 256
  const chunks: T[][] = []
  const listeners = new Set<() => void>()
  let version = 0
  let snapshotVersion = -1
  let snapshot: T[] = []
  const append = (message: T): void => {
    let chunk = chunks[chunks.length - 1]
    if (!chunk || chunk.length === chunkSize) {
      chunk = []
      chunks.push(chunk)
    }
    chunk.push(message)
    version++
    for (const listener of listeners) listener()
  }
  const getSnapshot = (): T[] => {
    if (snapshotVersion !== version) {
      snapshot = chunks.flat()
      snapshotVersion = version
    }
    return snapshot
  }
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  return { append, getSnapshot, subscribe }
}
