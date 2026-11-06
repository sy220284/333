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
