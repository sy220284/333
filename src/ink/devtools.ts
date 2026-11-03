/**
 * Opt-in React DevTools bridge for development builds.
 * The socket is opened only when a local DevTools server is reachable.
 * This is never imported into the release bundle (NODE_ENV gate).
 */
import { createRequire } from 'node:module'
import { createConnection } from 'node:net'

export type DevtoolsMessaging = {
  initialize: () => void
  connectWithCustomMessagingProtocol: (options: {
    onSubscribe: (listener: (message: unknown) => void) => void
    onUnsubscribe: (listener: (message: unknown) => void) => void
    onMessage: (event: string, payload: unknown) => void
  }) => void
}

export type DevtoolsSocket = {
  readyState: number
  send: (message: string) => void
  close: () => void
  addEventListener: (type: string, listener: (event: { data?: unknown }) => void) => void
}

export function connectInkDevtoolsSocket(
  socket: DevtoolsSocket,
  devtools: DevtoolsMessaging,
): void {
  const listeners = new Set<(message: unknown) => void>()
  socket.addEventListener('message', event => {
    if (typeof event.data !== 'string') return
    let message: unknown
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    for (const listener of listeners) listener(message)
  })
  socket.addEventListener('open', () => {
    devtools.connectWithCustomMessagingProtocol({
      onSubscribe: listener => listeners.add(listener),
      onUnsubscribe: listener => listeners.delete(listener),
      onMessage(event, payload) {
        if (socket.readyState === 1)
          socket.send(JSON.stringify({ event, payload }))
      },
    })
  })
  socket.addEventListener('close', () => {
    listeners.clear()
    const globalHook = (globalThis as Record<string, unknown>)
      .__REACT_DEVTOOLS_GLOBAL_HOOK__ as
      | { reactDevtoolsAgent?: { shutdown: () => void } }
      | undefined
    globalHook?.reactDevtoolsAgent?.shutdown()
  })
}

/** Probe the local-only developer service before importing DevTools. */
export async function isReactDevtoolsReachable(port = 8097): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port })
    let settled = false
    const done = (reachable: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(reachable)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(350, () => done(false))
  })
}

export async function initializeInkDevtools(): Promise<boolean> {
  if (!(await isReactDevtoolsReachable())) return false

  // react-devtools-core requires these browser-like globals before loading.
  const host = globalThis as Record<string, unknown>
  host.window ??= globalThis
  host.self ??= globalThis

  // Keep the package optional, but report a real load error to the caller.
  const pkg = createRequire(import.meta.url)('react-devtools-core') as
    | DevtoolsMessaging
    | { default: DevtoolsMessaging }
  const devtools = 'default' in pkg ? pkg.default : pkg
  devtools.initialize()
  const socket = new WebSocket('ws://127.0.0.1:8097')
  connectInkDevtoolsSocket(socket, devtools)
  return true
}
