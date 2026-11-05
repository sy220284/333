import { createServer, type Server } from 'node:net'
import { chmod, mkdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { registerCleanup } from './cleanupRegistry.js'
import { wrapCrossSessionMessage } from './peerMessageEnvelope.ts'
import { logForDebugging } from './debug.js'

let activeServer: Server | null = null
let currentPath: string | undefined
let lastStartFailureCause: 'bind_failed' | undefined

export function getUdsStartFailureCause(): 'bind_failed' | undefined {
  return lastStartFailureCause
}

// 317 chunk-00bcssqf: automatic inbox binding is optional during startup;
// an explicitly requested endpoint must report its failure to the caller.
export async function startCrossSessionInbox(socketPath?: string): Promise<boolean> {
  return startInboxAtPath(
    socketPath ?? getDefaultUdsSocketPath(),
    socketPath !== undefined,
  )
}

/**
 * Shared startup behavior for automatically selected and explicitly requested
 * endpoints. A caller-requested path must fail visibly; optional discovery
 * must leave the CLI usable when binding is unavailable.
 */
export async function startInboxAtPath(path: string, required: boolean): Promise<boolean> {
  lastStartFailureCause = 'bind_failed'
  if (process.platform === 'win32') {
    // Windows has no Unix-domain-socket inbox in this transport.
    if (required) {
      throw new Error('--messaging-socket-path: Unix-domain sockets are unavailable on Windows')
    }
    return false
  }
  try {
    await startUdsMessaging(path)
  } catch (error) {
    if (required) {
      throw new Error(`--messaging-socket-path: cannot bind at ${path}: ${String(error)}`, { cause: error })
    }
    logForDebugging(`[uds-messaging] Failed to start: ${String(error)}`, { level: 'error' })
    return false
  }
  if (currentPath === undefined) {
    if (required) throw new Error(`--messaging-socket-path: no socket was created at ${path}`)
    return false
  }
  lastStartFailureCause = undefined
  return true
}

export function getDefaultUdsSocketPath(): string {
  const base = tmpdir().length > 35 ? '/tmp' : tmpdir()
  return join(base, `claude-peer-${process.getuid?.() ?? 'user'}-${process.pid}-${randomUUID().slice(0, 8)}.sock`)
}
export function getMessagingSocketPath(): string | undefined { return currentPath }

/** Binding must finish before registerSession() advertises the socket path. */
export async function startUdsMessaging(socketPath: string = getDefaultUdsSocketPath()): Promise<void> {
  if (process.platform === 'win32' || activeServer) return
  if (!socketPath.startsWith('/') || Buffer.byteLength(socketPath) > 95) throw new Error('UDS socket must be a short absolute path')
  await mkdir(dirname(socketPath), { recursive: true })
  const server = createServer(socket => {
    let data = ''
    let handled = false
    socket.setTimeout(5000)
    socket.on('data', async chunk => {
      if (handled) return
      data += chunk.toString('utf8')
      if (Buffer.byteLength(data) > 65536 + 256) { handled = true; socket.end('ERR size\n'); return }
      const newline = data.indexOf('\n')
      if (newline < 0) return
      handled = true
      let parsed: unknown
      try { parsed = JSON.parse(data.slice(0, newline)) }
      catch { socket.end('ERR json\n'); return }
      const value = parsed as { message?: unknown }
      if (typeof value?.message !== 'string' || !value.message.trim() || Buffer.byteLength(value.message) > 65536) {
        socket.end('ERR message\n'); return
      }
      try {
        const { enqueuePendingNotification } = await import('./messageQueueManager.js')
        enqueuePendingNotification({ mode: 'prompt', value: wrapCrossSessionMessage(value.message, 'unknown'), priority: 'later' })
        socket.end('OK\n')
      } catch { socket.end('ERR delivery\n') }
    })
    socket.once('timeout', () => socket.end('ERR timeout\n'))
    socket.on('error', () => {})
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(socketPath, () => { server.removeListener('error', reject); resolve() })
    })
    await chmod(socketPath, 0o600)
  } catch (error) {
    server.close()
    throw error
  }
  activeServer = server
  currentPath = socketPath
  process.env.CLAUDE_CODE_MESSAGING_SOCKET = socketPath
  registerCleanup(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await unlink(socketPath)
    if (currentPath === socketPath) {
      currentPath = undefined
      if (process.env.CLAUDE_CODE_MESSAGING_SOCKET === socketPath) delete process.env.CLAUDE_CODE_MESSAGING_SOCKET
    }
  })
}
